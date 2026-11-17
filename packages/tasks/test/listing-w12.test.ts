import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { parsePastedListing, findPriceSpans } from "../src/listing-parse.js";
import { fetchListing, parseListingHtml, ListingFetchError, __resetListingFetchState } from "../src/listing-url.js";
import { makeReadLabel } from "../src/read-label.js";
import { LocalFileStore } from "../src/storage.js";
import { labelReadSchema, LABEL_READ_MARKER, listingProposalSchema } from "@oia/schema";
import type { TaskContext } from "../src/store.js";

beforeEach(() => __resetListingFetchState());

/** Minimal opaque bytes: the store never parses images, put() only needs bytes. */
const png = (r: number, g: number, b: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, r, g, b]);

describe("W1.2 door 3: parsePastedListing (0 AI, deterministic)", () => {
  it("first line becomes the name, whole text the description, prices highlighted", () => {
    const p = parsePastedListing("Serum cấp ẩm HA 30ml\nGiá chỉ 289.000đ hôm nay.\nHàng chính hãng, freeship.");
    expect(p.name).toBe("Serum cấp ẩm HA 30ml");
    expect(p.description).toContain("289.000đ");
    expect(p.priceSpans).toHaveLength(1);
    expect(p.description.slice(p.priceSpans[0].start, p.priceSpans[0].end)).toBe("289.000đ");
  });

  it("VN price shapes: dotted thousands + suffix, k, tr, VND; NOT version numbers or dates", () => {
    const spans = (s: string) => findPriceSpans(s).map((x) => s.slice(x.start, x.end));
    expect(spans("giá 1.299.000 VND")).toEqual(["1.299.000 VND"]);
    expect(spans("250k thôi")).toEqual(["250k"]);
    expect(spans("1tr2 và 1.2tr")).toEqual(["1tr2", "1.2tr"]);
    expect(spans("99.000₫")).toEqual(["99.000₫"]);
    expect(spans("v1.1 và ngày 20.11 không phải giá")).toEqual([]);
    expect(spans("phi 25.000 đ")).toEqual(["25.000 đ"]);
  });

  it("a first line longer than the name limit leaves name empty, description intact", () => {
    const long = "x".repeat(201);
    const p = parsePastedListing(`${long}\nbody`);
    expect(p.name).toBe("");
    expect(p.description.startsWith("x".repeat(201))).toBe(true);
  });

  it("empty paste and over-limit paste fail loudly (visible, not silent)", () => {
    expect(() => parsePastedListing("   ")).toThrow(/paste the listing text/i);
    expect(() => parsePastedListing("a".repeat(20_001))).toThrow(/limit is 20000/i);
  });
});

describe("W1.2 door 6: parseListingHtml", () => {
  it("JSON-LD Product wins when present", () => {
    const html = `<html><head><title>Bad title</title><script type="application/ld+json">{"@type":"Product","name":"Hydra Ampoule II","description":"8 tầng HA","brand":{"name":"LUMA"}}</script></head></html>`;
    const p = parseListingHtml(html, "shop.example");
    expect(p.name).toBe("Hydra Ampoule II");
    expect(p.brand).toBe("LUMA");
    expect(p.source).toBe("shop.example");
  });

  it("falls back to og: tags, then <title>, meta description; malformed ld+json never throws", () => {
    const og = parseListingHtml(`<meta property="og:title" content="OG name"><meta property="og:description" content="OG desc">`, "a");
    expect(og.name).toBe("OG name");
    expect(og.description).toBe("OG desc");
    const titleOnly = parseListingHtml(`<html><head><title>Fallback title</title><meta name="description" content="d"></head>`, "b");
    expect(titleOnly.name).toBe("Fallback title");
    expect(titleOnly.description).toBe("d");
    const broken = parseListingHtml(`<script type="application/ld+json">{not json</script><title>T</title>`, "c");
    expect(broken.name).toBe("T");
  });
});

describe("W1.2 door 6: fetchListing guards (real local HTTP server)", () => {
  let srv: Server; let port: number;

  async function start(handler: (req: { url: string }, res: { setHeader: (k: string, v: string) => void; statusCode: number; writeHead: (c: number) => void; write: (b: string) => void; writeHeader: () => void; end: (b?: string) => void }) => void): Promise<void> {
    srv = createServer(handler);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    port = (srv.address() as { port: number }).port;
  }

  it("happy path: honest fetch, JSON-LD parsed, second fetch served from cache (1 upstream hit)", async () => {
    let upstream = 0;
    await start((_q, res) => {
      upstream += 1;
      res.writeHead(200);
      res.end(`<title>t</title><script type="application/ld+json">{"@type":"Product","name":"Cached product","description":"d"}</script>`);
    });
    const first = await fetchListing(`http://127.0.0.1:${port}/p`);
    expect(first.name).toBe("Cached product");
    await fetchListing(`http://127.0.0.1:${port}/p`);
    expect(upstream).toBe(1); // cache hit
    srv.close();
  });

  it("error paths: invalid URL, non-http scheme, HTTP 403, connection refused; each carries a mapped class", async () => {
    await expect(fetchListing("not a url")).rejects.toMatchObject({ errorClass: "listing_invalid_url" });
    await expect(fetchListing("ftp://x/y")).rejects.toMatchObject({ errorClass: "listing_invalid_url" });
    await start((_q, res) => { res.writeHead(403); res.end("no"); });
    await expect(fetchListing(`http://127.0.0.1:${port}/denied`)).rejects.toMatchObject({ errorClass: "listing_http" });
    srv.close();
    await expect(fetchListing("http://127.0.0.1:9/x")).rejects.toBeInstanceOf(ListingFetchError); // refused port, fast on CI too
  });

  it("redirect chain is followed (max 3) and lands on the product", async () => {
    await start((req, res) => {
      if (req.url === "/hop3") { res.writeHead(302, { location: "/hop2" }); res.end(); return; }
      if (req.url === "/hop2") { res.writeHead(302, { location: "/hop1" }); res.end(); return; }
      if (req.url === "/hop1") { res.writeHead(302, { location: "/final" }); res.end(); return; }
      res.writeHead(200);
      res.end(`<title>Redirected product</title>`);
    });
    const p = await fetchListing(`http://127.0.0.1:${port}/hop3`);
    expect(p.name).toBe("Redirected product");
    srv.close();
  });

  it("per-host rate limit trips after 6 distinct fetches in the window", async () => {
    await start((_q, res) => { res.writeHead(200); res.end(`<title>r</title>`); });
    for (let i = 0; i < 6; i++) await fetchListing(`http://127.0.0.1:${port}/u${i}`);
    await expect(fetchListing(`http://127.0.0.1:${port}/u7`)).rejects.toMatchObject({ errorClass: "listing_rate_limited" });
    srv.close();
  });

  it("oversize body is refused mid-stream, before parsing", async () => {
    await start((_q, res) => {
      res.writeHead(200);
      res.write("x".repeat(1024));
      res.write("x".repeat(3 * 1024 * 1024)); // > 2MB cap
      res.end();
    });
    await expect(fetchListing(`http://127.0.0.1:${port}/big`)).rejects.toMatchObject({ errorClass: "listing_too_large" });
    srv.close();
  });
});

describe("W1.2 door 2: makeReadLabel (metered read, 0 quota on validation failure)", () => {
  const tctx = (over: Partial<TaskContext> = {}): TaskContext => ({ jobId: "job1", signal: new AbortController().signal, ...over });

  it("validation failure burns ZERO provider calls (file not in the store)", async () => {
    let providerCalls = 0;
    const files = new LocalFileStore(path.join(mkdtempSync(path.join(tmpdir(), "oia-rl-")), "files"));
    const run = makeReadLabel({
      store: { read: (k) => files.read(k) },
      llm: { name: "stub", capabilities: { referenceImages: true }, readImage: async () => { providerCalls += 1; return "{}"; } },
    });
    await expect(run({ fileUrl: "/api/files/uploads/20990101/missing.png" }, tctx())).rejects.toThrow(/has not been uploaded/);
    expect(providerCalls).toBe(0); // the store miss IS the 0-quota guarantee, no readImage call
  });

  it("a successful read maps bytes → LabelRead through the shared prompt + schema", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "oia-rl2-"));
    const files = new LocalFileStore(path.join(dir, "files"));
    const { url } = await files.put(png(1, 2, 3), "png");
    const seenPrompt: string[] = [];
    const run = makeReadLabel({
      store: { read: (k) => files.read(k) },
      llm: {
        name: "stub",
        capabilities: { referenceImages: true },
        readImage: async (prompt, _img, schema) => {
          seenPrompt.push(prompt);
          expect(String((schema as { required?: string[] }).required)).toContain("facts");
          return JSON.stringify({ name: "Hydra Ampoule II 30ml", brand: "LUMA", facts: [{ text: "8 tầng HA" }] });
        },
      },
    });
    const result = await run({ fileUrl: url }, tctx());
    expect(seenPrompt[0]).toContain(LABEL_READ_MARKER);
    expect(result.labelRead).toEqual(labelReadSchema.parse({ name: "Hydra Ampoule II 30ml", brand: "LUMA", facts: [{ text: "8 tầng HA" }] }));
    expect(result.urls).toEqual([url]);
  });

  it("malformed provider JSON fails with plan_parse_failed, never silently merges", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "oia-rl3-"));
    const files = new LocalFileStore(path.join(dir, "files"));
    const { url } = await files.put(png(4, 5, 6), "png");
    const run = makeReadLabel({
      store: { read: (k) => files.read(k) },
      llm: { name: "stub", capabilities: { referenceImages: true }, readImage: async () => "not json" },
    });
    await expect(run({ fileUrl: url }, tctx())).rejects.toMatchObject({ name: "ProviderError", errorClass: "plan_parse_failed" });
  });
});

describe("W1.2 shared envelope: listingProposalSchema stays strict", () => {
  it("unknown keys are refused (schema drift fails loudly)", () => {
    expect(() => listingProposalSchema.parse({ name: "x", description: "", brand: "", priceSpans: [], source: "s", extra: 1 })).toThrow();
  });
});

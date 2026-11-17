import { listingProposalSchema, type ListingProposal } from "@oia/schema";

/**
 * W1.2 door 6: fetch a PUBLIC listing page once, parse metadata into proposals.
 * Rào cửa 6 (execution-plan): run in the UTILITY process only (D15, the renderer
 * never gains a network origin), no browser spoofing (honest UA, no cookies),
 * per-host rate limit, TTL cache, hard timeout + byte cap, max 3 redirects.
 * 0 quota: text fetch + local parse, no provider involved.
 */

const UA = "Oia/1.0 (product profile import; +https://oia.solutions)";
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const RATE_LIMIT = 6; // per window, per host
const RATE_WINDOW_MS = 60_000;
const CACHE_TTL_MS = 10 * 60_000;

const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; value: ListingProposal }>();

function rateLimited(host: string, now = Date.now()): boolean {
  const window = (hits.get(host) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.set(host, window);
  return window.length >= RATE_LIMIT;
}

function cached(key: string, now = Date.now()): ListingProposal | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}

export class ListingFetchError extends Error {
  /** Survives the utility wire (serializeUtilityError), the renderer maps on it. */
  readonly errorClass: string;
  constructor(message: string, reason: "invalid-url" | "rate-limited" | "timeout" | "too-large" | "http" | "offline") {
    super(message);
    this.name = "ListingFetchError";
    this.errorClass = `listing_${reason.replace("-", "_")}`;
  }
}

export function parseListingHtml(html: string, source: string): ListingProposal {
  const jsonLdName = (): { name: string; description: string; brand: string } => {
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const data = JSON.parse(m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ""));
        const nodes = Array.isArray(data) ? data : [data, ...(data["@graph"] ?? [])];
        const product = nodes.find((n: Record<string, unknown>) => typeof n?.["@type"] === "string" && /(^|\W)product(\W|$)/i.test(String(n["@type"])));
        if (product && typeof product.name === "string") {
          return {
            name: String(product.name).slice(0, 200),
            description: typeof product.description === "string" ? product.description.slice(0, 20_000) : "",
            brand: typeof product.brand === "object" && product.brand ? String((product.brand as Record<string, unknown>).name ?? "") : typeof product.brand === "string" ? product.brand : "",
          };
        }
      } catch { /* malformed ld+json is common, fall through */ }
    }
    return { name: "", description: "", brand: "" };
  };
  const meta = (prop: string): string => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))
      ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"));
    return m ? m[1] : "";
  };
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const ld = jsonLdName();
  const name = ld.name || meta("og:title") || titleTag.trim();
  const description = ld.description || meta("og:description") || meta("description");
  const brand = ld.brand || meta("og:site_name");
  const body = description || "";
  return listingProposalSchema.parse({
    name: name.slice(0, 200),
    description: body.slice(0, 20_000),
    brand: brand.slice(0, 120),
    priceSpans: [], // price spans are a paste-lane affordance; URL text arrives already clean
    source,
  });
}

async function followRedirects(url: string, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      try { await res.body?.cancel(); } catch { /* already gone */ }
      continue;
    }
    return res;
  }
  throw new ListingFetchError(`Too many redirects (over ${MAX_REDIRECTS}).`, "http");
}

export async function fetchListing(url: string): Promise<ListingProposal> {
  const key = url.trim();
  const cachedValue = cached(key);
  if (cachedValue) return cachedValue;

  let parsed: URL;
  try {
    parsed = new URL(key);
  } catch {
    throw new ListingFetchError("That does not look like a valid URL.", "invalid-url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ListingFetchError("Only http and https URLs can be fetched.", "invalid-url");
  }
  if (rateLimited(parsed.host)) {
    throw new ListingFetchError(`Rate limit: at most ${RATE_LIMIT} fetches per minute per site, wait a moment.`, "rate-limited");
  }
  hits.get(parsed.host)!.push(Date.now());

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await followRedirects(parsed.toString(), ac.signal);
  } catch (e) {
    if (ac.signal.aborted) throw new ListingFetchError(`The site did not answer within ${TIMEOUT_MS / 1000}s.`, "timeout");
    throw new ListingFetchError("Could not reach that URL from this machine.", "offline");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ListingFetchError(`The site answered HTTP ${res.status}.`, "http");
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) throw new ListingFetchError(`The page is over ${Math.round(MAX_BYTES / 1024 / 1024)} MB, too large to import.`, "too-large");

  const reader = res.body?.getReader();
  if (!reader) throw new ListingFetchError("The site returned an empty body.", "http");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ListingFetchError(`The page is over ${Math.round(MAX_BYTES / 1024 / 1024)} MB, too large to import.`, "too-large");
      }
    }
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
  const value = parseListingHtml(html, parsed.host);
  cache.set(key, { at: Date.now(), value });
  return value;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Test seam: wipe rate-limit + cache state between cases. */
export function __resetListingFetchState(): void {
  hits.clear();
  cache.clear();
}

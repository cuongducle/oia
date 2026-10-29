import {
  createServiceContext,
  type ServiceContext,
} from "@oia/services";
import path from "node:path";

/** Runtime singleton over @oia/services — reused across routes (globalThis guards hot-reload duplicates). */
const g = globalThis as unknown as { __oiaRt?: ServiceContext };

export type Rt = ServiceContext;

export async function getRuntime(): Promise<ServiceContext> {
  if (g.__oiaRt) return g.__oiaRt;
  const dataDir = process.env.OIA_DATA_DIR ?? path.join(process.cwd(), ".data");
  g.__oiaRt = await createServiceContext({ dataDir });
  return g.__oiaRt;
}

/** TP.6 — health panel snapshot: provider matrix + diagnostics + quota counters. */
export async function providerStatus() {
  const rt = await getRuntime();
  const [imageDiag, llmDiag] = await Promise.all([rt.chat.image.isAvailable(), rt.chat.llm.isAvailable()]);
  return {
    image: { name: rt.chat.image.name, capabilities: rt.chat.image.capabilities, diagnostic: imageDiag },
    llm: { name: rt.chat.llm.name, capabilities: rt.chat.llm.capabilities, diagnostic: llmDiag },
    quota: rt.chat.meter.snapshot(),
  };
}

/** BR-KEY guard: with OIA_REQUIRE_KEY=1 a valid key is required (authorization header). */
export async function requireApiKey(req: Request): Promise<Response | null> {
  if (process.env.OIA_REQUIRE_KEY !== "1") return null;
  const { keys } = await getRuntime();
  const auth = (req.headers.get("authorization") ?? "").trim();
      if (!auth) return unauthorized("missing authorization header");
  const rec = keys.verify(auth);
      if (!rec) return unauthorized("API key is invalid or expired");
  return null;
}
function unauthorized(msg: string): Response {
  return Response.json({ code: 401, data: null, msg }, { status: 401 });
}

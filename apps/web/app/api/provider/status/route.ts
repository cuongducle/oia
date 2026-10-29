import { providerStatus } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/**
 * GET /api/provider/status (TP.6) — the health-panel snapshot: provider matrix with
 * capabilities, structured diagnostics (binary/version/login), and Oia-local quota
 * counters (per-day + per-session; Codex's own remaining allowance is shown only if a
 * stable local source is verified — never by spending an agent turn).
 */
export async function GET() {
  try {
    const status = await providerStatus();
    return Response.json({ code: 0, data: status, msg: "" });
  } catch (err) {
    return Response.json(
      { code: 1, data: null, msg: err instanceof Error ? err.message : "provider status failed" },
      { status: 500 },
    );
  }
}

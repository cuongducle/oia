import { getRuntime } from "@/libs/runtime";

export const dynamic = "force-dynamic";

/** GET /api/brand/context?sessionId= — the kit active for this chat (called after chat/send). */
export async function GET(req: Request) {
  const { brandKits } = await getRuntime();
  const kit = brandKits.active();
  return Response.json({ code: 0, data: kit ?? null, msg: "" });
}

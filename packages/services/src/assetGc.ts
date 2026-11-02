import { sweepUnreferencedAssets, type AssetGcResult } from "@oia/tasks";
import type { ServiceContext } from "./context.js";

/** Every store that can point at an upload — the reachability roots for T11. */
export function assetRoots(ctx: ServiceContext): unknown[] {
  const templates: unknown[] = [];
  for (let page = 1; ; page++) {
    const { items, total, pageSize } = ctx.templates.list({ page, pageSize: 100 });
    templates.push(...items);
    if (page * pageSize >= total) break;
  }
  return [
    ctx.projects.recent(Number.MAX_SAFE_INTEGER),
    ctx.chatSessions.recent(Number.MAX_SAFE_INTEGER),
    templates,
    ctx.brandKits.list(),
  ];
}

/** Remove uploads nothing references any more (older than the grace window). */
export function collectAssetGarbage(ctx: ServiceContext, opts: { graceMs?: number; now?: number } = {}): Promise<AssetGcResult> {
  return sweepUnreferencedAssets({ files: ctx.files, roots: assetRoots(ctx), ...opts });
}

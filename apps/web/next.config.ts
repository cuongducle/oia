import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  // bullmq/ioredis optional deps (@valkey/valkey-glide) must stay server-side runtime requires,
  // not bundled — the web process only touches them when REDIS_URL is set
  serverExternalPackages: ["bullmq", "ioredis"],
  transpilePackages: [
    "@oia/agent",
    "@oia/canvas",
    "@oia/providers",
    "@oia/protocol",
    "@oia/schema",
  ],
  webpack: (cfg, { isServer }) => {
    if (!isServer) {
  // pptxgenjs ESM-imports node:fs/node:https on the node branch — alias false for the client
      cfg.resolve = cfg.resolve ?? {};
      cfg.resolve.alias = {
        ...cfg.resolve.alias,
        "node:fs": false,
        "node:fs/promises": false,
        "node:https": false,
        "node:path": false,
        "node:crypto": false,
        "node:stream": false,
        "node:zlib": false,
        "node:url": false,
        "node:os": false,
        "node:child_process": false,
      };
      cfg.resolve.fallback = { ...cfg.resolve.fallback, fs: false, https: false, path: false };
    }
    return cfg;
  },
};

export default config;

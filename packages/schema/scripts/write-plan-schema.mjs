/**
 * Regenerates src/plan.schema.json from the PLAN_JSON_SCHEMA source of truth.
 * Run after changing plan.ts:  pnpm --filter @oia/schema schema:write
 */
import { writeFileSync } from "node:fs";
import { PLAN_JSON_SCHEMA } from "../dist/plan.js";

writeFileSync(
  new URL("../src/plan.schema.json", import.meta.url),
  JSON.stringify(PLAN_JSON_SCHEMA, null, 2) + "\n",
);
console.log("wrote src/plan.schema.json");

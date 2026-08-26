import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const db = readFileSync(resolve(process.cwd(), "apps/api/src/db.ts"), "utf8");

/**
 * These are pool options rather than application code, so nothing else in the suite would
 * notice them being dropped - but dropping them brings back two live bugs at once:
 * COUNT(*) returning bigint (which JSON.stringify throws on, blanking admin lists) and
 * SUM()/DECIMAL returning strings (which silently concatenate instead of adding).
 */
describe("database driver number coercion", () => {
  it.each(["bigIntAsNumber", "decimalAsNumber", "insertIdAsNumber"])(
    "keeps %s enabled on the pool",
    (option) => {
      expect(db).toContain(`${option}: true`);
    }
  );
});

/**
 * Deploy gate: exits non-zero when the database is behind `001_init.sql`.
 *
 * Run after `npm run migrate` so a migration that did not actually apply - a skipped
 * step, an ALTER that errored past a swallowed failure, a database the deploy was not
 * pointed at - stops the deploy instead of leaving the drift to be discovered later by
 * an admin whose page will not load.
 */
import { pool } from "./db.js";
import { driftSummary, schemaDrift } from "./schema-check.js";
async function main() {
    const lines = driftSummary(await schemaDrift());
    if (!lines.length) {
        console.log("Schema check: database matches apps/api/sql/001_init.sql.");
        return;
    }
    console.error("Schema check FAILED - the database is behind apps/api/sql/001_init.sql:");
    for (const line of lines)
        console.error(`  - ${line}`);
    console.error("Run `npm run migrate` in apps/api against this database, then deploy again.");
    process.exitCode = 1;
}
main()
    .catch((error) => {
    console.error("Schema check could not run", error);
    process.exitCode = 1;
})
    .finally(() => pool.end());

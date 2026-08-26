/**
 * Guards against the database quietly falling behind the code.
 *
 * `001_init.sql` is the schema the code is written against, but nothing forced the two to
 * agree at runtime: a deploy that skipped `npm run migrate`, or a developer whose local
 * database predates a column, left the API issuing statements against columns that were
 * not there. The failure surfaced far from the cause - a bulk send returned "Unknown
 * column 'sms_recipient_count'" as a generic 500, and the admin read it as the messaging
 * page being broken rather than the schema being old.
 *
 * The expectations are parsed out of the migration file rather than restated here. A
 * hand-kept list is its own thing to forget to update, which is the bug this is meant to
 * catch; deriving it means a column added to the SQL is checked from that moment on.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.js";
// Everything a table body can hold that is not a column.
const notAColumn = /^(PRIMARY\s+KEY|UNIQUE\s+(KEY|INDEX)|KEY|INDEX|FULLTEXT|SPATIAL|CONSTRAINT|FOREIGN\s+KEY|CHECK)\b/i;
function stripComments(sql) {
    return sql.replace(/^[ \t]*--[^\r\n]*$/gm, "");
}
/** Splits a CREATE TABLE body on top-level commas, so `VARCHAR(64)` stays intact. */
function topLevelParts(body) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const character of body) {
        if (character === "(")
            depth += 1;
        if (character === ")")
            depth -= 1;
        if (character === "," && depth === 0) {
            parts.push(current);
            current = "";
            continue;
        }
        current += character;
    }
    parts.push(current);
    return parts;
}
/** The tables and columns `001_init.sql` says should exist. */
export function parseExpectedSchema(sql) {
    const source = stripComments(sql);
    const expected = new Map();
    const createTable = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?([a-zA-Z0-9_]+)`?\s*\(/gi;
    let match;
    while ((match = createTable.exec(source))) {
        const table = match[1].toLowerCase();
        // Walk from the opening bracket to its match so nested type lengths are skipped.
        let depth = 0;
        let end = -1;
        for (let index = match.index + match[0].length - 1; index < source.length; index += 1) {
            if (source[index] === "(")
                depth += 1;
            else if (source[index] === ")") {
                depth -= 1;
                if (depth === 0) {
                    end = index;
                    break;
                }
            }
        }
        if (end === -1)
            continue;
        const body = source.slice(match.index + match[0].length, end);
        const columns = new Set();
        for (const part of topLevelParts(body)) {
            const line = part.trim();
            if (!line || notAColumn.test(line))
                continue;
            const column = line.match(/^`?([a-zA-Z0-9_]+)`?\s/);
            if (column)
                columns.add(column[1].toLowerCase());
        }
        // A later CREATE for the same table should not drop what an earlier one declared.
        const already = expected.get(table);
        if (already)
            for (const column of columns)
                already.add(column);
        else
            expected.set(table, columns);
    }
    const addColumn = /ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+`?([a-zA-Z0-9_]+)`?/gi;
    while ((match = addColumn.exec(source))) {
        const table = match[1].toLowerCase();
        if (!expected.has(table))
            expected.set(table, new Set());
        expected.get(table).add(match[2].toLowerCase());
    }
    return expected;
}
/** Compares the parsed expectation against what the connected database actually has. */
export function compareSchema(expected, actual) {
    const missingTables = [];
    const missingColumns = [];
    for (const [table, columns] of expected) {
        const live = actual.get(table);
        if (!live) {
            missingTables.push(table);
            continue;
        }
        for (const column of columns) {
            if (!live.has(column))
                missingColumns.push({ table, column });
        }
    }
    return { missingTables, missingColumns };
}
/**
 * Resolved on call rather than at import, so loading this module for the parsing helpers
 * alone - as the tests do - never depends on how the loader spells `import.meta.url`.
 */
function migrationPath() {
    return resolve(dirname(fileURLToPath(import.meta.url)), "../sql/001_init.sql");
}
async function liveSchema() {
    const rows = await query(`SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()`);
    const actual = new Map();
    for (const row of rows) {
        const table = String(row.TABLE_NAME ?? row.table_name ?? "").toLowerCase();
        const column = String(row.COLUMN_NAME ?? row.column_name ?? "").toLowerCase();
        if (!table || !column)
            continue;
        if (!actual.has(table))
            actual.set(table, new Set());
        actual.get(table).add(column);
    }
    return actual;
}
export async function schemaDrift() {
    return compareSchema(parseExpectedSchema(readFileSync(migrationPath(), "utf8")), await liveSchema());
}
export function driftSummary(drift) {
    const lines = [];
    if (drift.missingTables.length)
        lines.push(`missing tables: ${drift.missingTables.join(", ")}`);
    for (const { table, column } of drift.missingColumns)
        lines.push(`missing column: ${table}.${column}`);
    return lines;
}
/**
 * Reports drift at boot rather than waiting for a write to hit the missing column.
 *
 * Deliberately does not exit. Refusing to start would take the whole shop offline over a
 * column one admin screen needs, which is a worse outcome than running degraded; the log
 * names the fix so the person reading it does not have to guess.
 */
export async function reportSchemaDrift() {
    try {
        const drift = await schemaDrift();
        const lines = driftSummary(drift);
        if (!lines.length)
            return drift;
        console.error([
            "",
            "  SCHEMA OUT OF DATE - the database is behind apps/api/sql/001_init.sql.",
            "  Writes touching these will fail with \"Unknown column\" and surface as a 500:",
            ...lines.map((line) => `    - ${line}`),
            "  Fix: run `npm run migrate` in apps/api against this database.",
            ""
        ].join("\n"));
        return drift;
    }
    catch (error) {
        console.error("Schema check could not run", error);
        return null;
    }
}

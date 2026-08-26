import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compareSchema, parseExpectedSchema } from "../apps/api/src/schema-check";

const migration = readFileSync(resolve(process.cwd(), "apps/api/sql/001_init.sql"), "utf8");

describe("parseExpectedSchema", () => {
  it("reads columns out of a CREATE TABLE without mistaking indexes for columns", () => {
    const expected = parseExpectedSchema(`
      CREATE TABLE IF NOT EXISTS widgets (
        id VARCHAR(64) PRIMARY KEY,
        label VARCHAR(191) NOT NULL,
        size DECIMAL(10, 2) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        INDEX widgets_label_idx (label),
        UNIQUE KEY widgets_label_uq (label)
      ) ENGINE=InnoDB;
    `);

    expect([...expected.get("widgets")!].sort()).toEqual(["id", "label", "size"]);
  });

  it("counts columns added by a later ALTER TABLE", () => {
    const expected = parseExpectedSchema(`
      CREATE TABLE IF NOT EXISTS widgets (id VARCHAR(64) PRIMARY KEY);
      -- a comment must not hide the statement beneath it
      ALTER TABLE widgets ADD COLUMN IF NOT EXISTS colour VARCHAR(20) NOT NULL DEFAULT '';
    `);

    expect(expected.get("widgets")!.has("colour")).toBe(true);
  });

  it("picks up every messaging column the campaign writer depends on", () => {
    const campaigns = parseExpectedSchema(migration).get("message_campaigns")!;

    // These six were added to the SQL and the code together, but never reached databases
    // that had already been created - which is the drift this check exists to catch.
    for (const column of [
      "sms_recipient_count",
      "email_recipient_count",
      "sms_success_count",
      "email_success_count",
      "sms_failure_count",
      "email_failure_count"
    ]) {
      expect(campaigns.has(column)).toBe(true);
    }
  });
});

describe("compareSchema", () => {
  it("reports a table the database has never had", () => {
    const drift = compareSchema(new Map([["widgets", new Set(["id"])]]), new Map());
    expect(drift.missingTables).toEqual(["widgets"]);
    expect(drift.missingColumns).toEqual([]);
  });

  it("reports a column the database is behind on", () => {
    const drift = compareSchema(
      new Map([["widgets", new Set(["id", "colour"])]]),
      new Map([["widgets", new Set(["id"])]])
    );

    expect(drift.missingTables).toEqual([]);
    expect(drift.missingColumns).toEqual([{ table: "widgets", column: "colour" }]);
  });

  it("stays quiet when the database is ahead of the migration", () => {
    const drift = compareSchema(
      new Map([["widgets", new Set(["id"])]]),
      new Map([["widgets", new Set(["id", "spare"])]])
    );

    expect(drift.missingTables).toEqual([]);
    expect(drift.missingColumns).toEqual([]);
  });
});

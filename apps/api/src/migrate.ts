import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execute, pool, query } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, "../sql/001_init.sql");

function splitStatements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  const sql = readFileSync(migrationPath, "utf8");

  for (const statement of splitStatements(sql)) {
    await executeSchemaStatement(statement);
  }

  await ensurePerformanceIndexes();
  await mergeLegacyProductDescriptions();
  await backfillDefaultProductOptions();

  console.log("Database schema is ready.");
}

const performanceIndexes = [
  { table: "users", name: "users_role_created_idx", columns: "role, created_at" },
  { table: "orders", name: "orders_status_created_idx", columns: "status, created_at" },
  { table: "orders", name: "orders_payment_created_idx", columns: "payment_status, created_at" },
  { table: "products", name: "products_active_category_updated_idx", columns: "is_active, category_id, updated_at" },
  { table: "products", name: "products_active_stock_idx", columns: "is_active, stock_quantity" },
  { table: "product_images", name: "product_images_primary_sort_idx", columns: "product_id, is_primary, sort_order" },
  { table: "order_items", name: "order_items_product_order_idx", columns: "product_id, order_id" },
] as const;

async function ensurePerformanceIndexes() {
  for (const index of performanceIndexes) {
    const existing = await query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
      [index.table, index.name],
    );
    if (Number(existing[0]?.count ?? 0) > 0) continue;
    await execute(`ALTER TABLE \`${index.table}\` ADD INDEX \`${index.name}\` (${index.columns})`);
  }
}

/**
 * `ADD COLUMN IF NOT EXISTS` is MariaDB syntax that MySQL rejects, so it is
 * emulated here by checking information_schema first.
 *
 * The match runs against the statement with leading `--` comment lines removed.
 * Anchoring on the raw text meant a single explanatory comment above an
 * `ADD COLUMN IF NOT EXISTS` line silently skipped this shim and sent the
 * unsupported syntax straight to the server.
 */
function withoutLeadingComments(statement: string) {
  return statement.replace(/^(?:[ \t]*--[^\r\n]*\r?\n)+/, "").trim();
}

async function executeSchemaStatement(statement: string) {
  const conditionalColumn = withoutLeadingComments(statement).match(
    /^ALTER TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD COLUMN IF NOT EXISTS\s+`?([a-zA-Z0-9_]+)`?/i,
  );

  if (!conditionalColumn) {
    await execute(statement);
    return;
  }

  const [, tableName, columnName] = conditionalColumn;
  const existing = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );

  if (Number(existing[0]?.count ?? 0) > 0) return;
  await execute(withoutLeadingComments(statement).replace(/ADD COLUMN IF NOT EXISTS/i, "ADD COLUMN"));
}

type LegacyProductDescription = {
  id: string;
  short_description: string | null;
  description: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asRichParagraphs(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function plainDescription(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

async function mergeLegacyProductDescriptions() {
  const products = await query<LegacyProductDescription>(
    `SELECT id, short_description, description
     FROM products
     WHERE short_description IS NOT NULL AND TRIM(short_description) <> ''`,
  );

  for (const product of products) {
    const shortText = product.short_description?.trim() ?? "";
    const currentDescription = product.description?.trim() ?? "";
    const merged = plainDescription(currentDescription).includes(plainDescription(shortText))
      ? asRichParagraphs(currentDescription)
      : `${asRichParagraphs(shortText)}${asRichParagraphs(currentDescription)}`;

    await execute(
      "UPDATE products SET description = ?, short_description = NULL WHERE id = ?",
      [merged || null, product.id],
    );
  }
}

async function backfillDefaultProductOptions() {
  await execute(
    `INSERT INTO product_options
       (id, product_id, label, selling_unit, price_cents, compare_at_cents, cost_cents, stock_multiplier, is_default, sort_order)
     SELECT
       CONCAT('opt_', REPLACE(UUID(), '-', '')), p.id,
       CASE
         WHEN p.selling_unit = 'METRE' THEN 'Per metre'
         WHEN p.selling_unit = 'ROLL' THEN 'Roll'
         WHEN p.selling_unit = 'CARTON' THEN 'Carton'
         WHEN p.selling_unit = 'BOX' THEN 'Box'
         WHEN p.selling_unit = 'PACK' THEN 'Pack'
         ELSE 'Unit'
       END,
       p.selling_unit, p.price_cents, p.compare_at_cents, p.cost_cents, 1, TRUE, 0
     FROM products p
     WHERE NOT EXISTS (SELECT 1 FROM product_options po WHERE po.product_id = p.id)`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

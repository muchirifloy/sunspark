import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { execute, pool, query, transaction } from "./db.js";
import { sendEmail } from "./email.js";
import { env } from "./env.js";
import { id, slugify } from "./id.js";
import { optimizeUploadedImage } from "./image-optimization.js";
import { HttpError, asyncRoute, errorHandler } from "./response.js";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  is_active: 0 | 1 | boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
  product_count?: number | string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  short_description: string | null;
  description: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  cost_cents: number;
  selling_unit: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: 0 | 1 | boolean;
  is_featured: 0 | 1 | boolean;
  is_hot_deal: 0 | 1 | boolean;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  category_id: string;
  created_at: Date;
  updated_at: Date;
  category_name?: string;
  category_slug?: string;
};

type ProductOptionRow = {
  id: string;
  product_id: string;
  label: string;
  selling_unit: string;
  price_cents: number;
  compare_at_cents: number | null;
  cost_cents: number;
  stock_multiplier: number | string;
  is_default: 0 | 1 | boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
};

type ImageRow = {
  id: string;
  product_id?: string;
  category_id?: string;
  url: string;
  alt: string | null;
  is_primary: 0 | 1 | boolean;
  sort_order: number;
  created_at: Date;
};

type CampaignRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  badge?: string | null;
  offer_label?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  is_active: 0 | 1 | boolean;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const app = express();
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uploadRoot = path.join(appRoot, "public", "uploads");
const adminApiToken = env("API_ADMIN_TOKEN", env("ADMIN_API_TOKEN", ""));

function cleanOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const allowedOrigins = cleanOrigins(env("FRONTEND_ORIGIN", env("NEXT_PUBLIC_SITE_URL", "")));

function sameSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

// Forwarding headers are attacker-controlled unless a proxy we trust rewrites
// them, and honouring them blindly lets one client rotate its rate-limit bucket
// on every request. Opt in explicitly once a proxy sits in front of this API.
const trustProxyHeaders = /^(1|true|yes)$/i.test(env("TRUST_PROXY_HEADERS", ""));

function clientKey(request: express.Request) {
  if (trustProxyHeaders) {
    const forwarded = String(request.headers["cf-connecting-ip"] || request.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();

    if (forwarded) return forwarded;
  }

  return request.socket.remoteAddress || "unknown";
}

function rateLimit({ windowMs, max, label }: { windowMs: number; max: number; label: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let nextSweepAt = 0;

  // Without this the map keeps one entry per client address forever, which is a
  // slow memory leak on a long-running process.
  const sweepExpired = (now: number) => {
    if (now < nextSweepAt) return;
    nextSweepAt = now + windowMs;

    for (const [entryKey, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(entryKey);
    }
  };

  return (request: express.Request, _response: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    sweepExpired(now);
    const key = `${label}:${clientKey(request)}`;
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > max) {
      next(new HttpError(429, "Too many attempts. Please try again shortly."));
      return;
    }

    next();
  };
}

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use(cors({
  origin(origin, callback) {
    // Server-to-server callers (the storefront, deploy scripts) send no Origin.
    if (!origin) {
      callback(null, true);
      return;
    }

    // An unset FRONTEND_ORIGIN used to allow every origin with credentials.
    // Missing configuration now denies browsers instead of opening the API up.
    if (allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
      callback(null, true);
      return;
    }

    callback(new HttpError(403, "This origin is not allowed."));
  },
  credentials: true
}));
app.use(express.json({ limit: "24mb" }));
app.use("/uploads", express.static(uploadRoot, { maxAge: "30d", immutable: true }));
app.use(["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password"], rateLimit({ windowMs: 15 * 60 * 1000, max: 20, label: "auth" }));
app.use(["/orders/checkout"], rateLimit({ windowMs: 10 * 60 * 1000, max: 30, label: "checkout" }));
app.use(["/admin/uploads"], rateLimit({ windowMs: 10 * 60 * 1000, max: 40, label: "uploads" }));
// The storefront only ever reaches this API server-to-server, so every route
// that can return another customer's details is gated on the shared service
// token. Browsers only talk to /uploads directly.
function requireServiceToken(request: express.Request, _response: express.Response, next: express.NextFunction) {
  if (!adminApiToken) {
    next(new HttpError(503, "Admin API protection is not configured."));
    return;
  }

  const supplied = String(request.headers["x-sunspark-admin-token"] ?? "");
  if (!supplied || !sameSecret(supplied, adminApiToken)) {
    next(new HttpError(401, "Admin access is not authorized."));
    return;
  }

  next();
}

app.use("/admin", requireServiceToken);

function truthy(value: 0 | 1 | boolean) {
  return value === true || value === 1;
}

function apiPublicBase() {
  return env("API_PUBLIC_URL", env("NEXT_PUBLIC_API_URL", "http://localhost:4000")).replace(/\/+$/, "");
}

function publicImageUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/uploads/")) return `${apiPublicBase()}${url}`;
  if (url.startsWith("uploads/")) return `${apiPublicBase()}/${url}`;
  return url;
}

function mapCategory(row: CategoryRow, images: ImageRow[] = [], products: unknown[] = [], children: unknown[] = []) {
  const productCount = Number(row.product_count ?? products.length ?? 0);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parent_id,
    isActive: truthy(row.is_active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productCount,
    images: images.map((image) => ({
      id: image.id,
      categoryId: image.category_id,
      url: publicImageUrl(image.url),
      alt: image.alt,
      isPrimary: truthy(image.is_primary),
      sortOrder: image.sort_order,
      createdAt: image.created_at
    })),
    products,
    children
  };
}

function mapProductOption(row: ProductOptionRow) {
  return {
    id: row.id,
    productId: row.product_id,
    label: row.label,
    sellingUnit: row.selling_unit,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    costCents: row.cost_cents,
    stockMultiplier: Number(row.stock_multiplier ?? 1),
    isDefault: truthy(row.is_default),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function fallbackProductOption(row: ProductRow) {
  return {
    id: "",
    productId: row.id,
    label: unitLabel(row.selling_unit),
    sellingUnit: row.selling_unit,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    costCents: row.cost_cents,
    stockMultiplier: 1,
    isDefault: true,
    sortOrder: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function unitLabel(unit: string) {
  const labels: Record<string, string> = {
    UNIT: "Unit",
    METRE: "Per metre",
    ROLL: "Roll",
    CARTON: "Carton",
    BOX: "Box",
    PACK: "Pack",
    PAIR: "Pair",
    SET: "Set",
    LITRE: "Litre",
    KILOGRAM: "Kilogram"
  };
  return labels[unit] ?? "Unit";
}

function mapProduct(row: ProductRow, images: ImageRow[] = [], options: ProductOptionRow[] = []) {
  const mappedOptions = options.length ? options.map(mapProductOption) : [fallbackProductOption(row)];
  const defaultOption = mappedOptions.find((option) => option.isDefault) ?? mappedOptions[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    shortDescription: row.short_description,
    description: row.description,
    priceCents: defaultOption.priceCents,
    compareAtCents: defaultOption.compareAtCents,
    costCents: defaultOption.costCents,
    sellingUnit: defaultOption.sellingUnit,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    isActive: truthy(row.is_active),
    isFeatured: truthy(row.is_featured),
    isHotDeal: truthy(row.is_hot_deal),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    seoKeywords: row.seo_keywords,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: row.category_name
      ? {
          id: row.category_id,
          name: row.category_name,
          slug: row.category_slug,
          description: null,
          parentId: null,
          isActive: true,
          sortOrder: 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          images: [],
          products: [],
          children: []
        }
      : undefined,
    images: images.map((image) => ({
      id: image.id,
      productId: image.product_id,
      url: publicImageUrl(image.url),
      alt: image.alt,
      isPrimary: truthy(image.is_primary),
      sortOrder: image.sort_order,
      createdAt: image.created_at
    })),
    options: mappedOptions
  };
}

function mapCampaign(row: CampaignRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.image_url ? publicImageUrl(row.image_url) : null,
    badge: row.badge ?? null,
    offerLabel: row.offer_label ?? null,
    ctaLabel: row.cta_label ?? null,
    ctaUrl: row.cta_url ?? null,
    isActive: truthy(row.is_active),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Uploads are downscaled to IMAGE_MAX_DIMENSION before they are written, so a
// larger incoming file does not mean a larger stored one.
const maxUploadMb = 5;
const maxUploadBytes = maxUploadMb * 1024 * 1024;

const uploadContentTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function safeUploadName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "image";
}

function frontendOrigin() {
  const configured = env("NEXT_PUBLIC_SITE_URL", env("SITE_URL", env("FRONTEND_ORIGIN", "http://localhost:3000")));
  return configured.split(",")[0].trim().replace(/\/+$/, "");
}

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const cleanText = (max = 255) => z.string().trim().max(max);
const optionalText = (max = 1000) => z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(max).optional().nullable()
);
const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().email().max(160).optional().nullable()
);
const slugInput = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a clean URL slug.");
const idInput = z.string().trim().min(2).max(80);
const imageUrlInput = z.string().trim().refine(
  (value) => value.startsWith("/uploads/") || value.startsWith("uploads/") || /^https:\/\/[^/]+/i.test(value),
  "Image URLs must be HTTPS or uploaded files."
);
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().url().optional().nullable()
);
const uploadedImageInput = z.object({
  url: imageUrlInput,
  alt: optionalText(160),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0)
});

async function assertUniqueCategorySlug(slug: string, currentId?: string) {
  if (currentId) {
    const current = await query<{ slug: string }>("SELECT slug FROM categories WHERE id = ? LIMIT 1", [currentId]);
    if (current[0]?.slug === slug) return;
  }
  const rows = await query<{ id: string }>("SELECT id FROM categories WHERE slug = ? LIMIT 1", [slug]);
  if (rows[0] && rows[0].id !== currentId) {
    throw new HttpError(409, "A category with that name already exists.");
  }
}

async function assertUniqueProductSlug(slug: string, currentId?: string) {
  const slugRows = await query<{ id: string }>("SELECT id FROM products WHERE slug = ? LIMIT 1", [slug]);
  if (slugRows[0] && slugRows[0].id !== currentId) {
    throw new HttpError(409, "A product with that name already exists.");
  }
}

async function imagesForProducts(productIds: string[]) {
  if (!productIds.length) return new Map<string, ImageRow[]>();
  const rows = await query<ImageRow>(
    `SELECT * FROM product_images WHERE product_id IN (${productIds.map(() => "?").join(",")})
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    productIds
  );
  return rows.reduce((map, row) => {
    const list = map.get(row.product_id ?? "") ?? [];
    list.push(row);
    map.set(row.product_id ?? "", list);
    return map;
  }, new Map<string, ImageRow[]>());
}

async function imagesForCategories(categoryIds: string[]) {
  if (!categoryIds.length) return new Map<string, ImageRow[]>();
  const rows = await query<ImageRow>(
    `SELECT * FROM category_images WHERE category_id IN (${categoryIds.map(() => "?").join(",")})
     ORDER BY is_primary DESC, sort_order ASC, created_at ASC`,
    categoryIds
  );
  return rows.reduce((map, row) => {
    const list = map.get(row.category_id ?? "") ?? [];
    list.push(row);
    map.set(row.category_id ?? "", list);
    return map;
  }, new Map<string, ImageRow[]>());
}

async function optionsForProducts(productIds: string[]) {
  if (!productIds.length) return new Map<string, ProductOptionRow[]>();
  const rows = await query<ProductOptionRow>(
    `SELECT * FROM product_options WHERE product_id IN (${productIds.map(() => "?").join(",")})
     ORDER BY is_default DESC, sort_order ASC, created_at ASC`,
    productIds
  );
  return rows.reduce((map, row) => {
    const list = map.get(row.product_id) ?? [];
    list.push(row);
    map.set(row.product_id, list);
    return map;
  }, new Map<string, ProductOptionRow[]>());
}

async function ensureDefaultOption(
  connection: Awaited<ReturnType<typeof pool.getConnection>> | null,
  productId: string,
  input: { sellingUnit: string; priceCents: number; compareAtCents?: number | null; costCents: number }
) {
  const runner = connection ?? { query: execute };
  const rows = await (connection
    ? connection.query("SELECT id FROM product_options WHERE product_id = ? AND is_default = TRUE LIMIT 1", [productId])
    : query<{ id: string }>("SELECT id FROM product_options WHERE product_id = ? AND is_default = TRUE LIMIT 1", [productId]));
  const existing = (rows as { id: string }[])[0];

  if (existing) {
    await runner.query(
      "UPDATE product_options SET label = ?, selling_unit = ?, price_cents = ?, compare_at_cents = ?, cost_cents = ?, sort_order = 0 WHERE id = ?",
      [unitLabel(input.sellingUnit), input.sellingUnit, input.priceCents, input.compareAtCents ?? null, input.costCents, existing.id]
    );
    return existing.id;
  }

  const optionId = id("opt");
  await runner.query(
    `INSERT INTO product_options
     (id, product_id, label, selling_unit, price_cents, compare_at_cents, cost_cents, stock_multiplier, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, TRUE, 0)`,
    [optionId, productId, unitLabel(input.sellingUnit), input.sellingUnit, input.priceCents, input.compareAtCents ?? null, input.costCents]
  );
  return optionId;
}

type ProductOptionInput = {
  id?: string | null;
  label: string;
  sellingUnit: string;
  priceCents: number;
  compareAtCents?: number | null;
  costCents: number;
  stockMultiplier: number;
  isDefault: boolean;
  sortOrder: number;
};

async function syncProductOptions(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  productId: string,
  options: ProductOptionInput[],
  deleteOptionIds: string[] = []
) {
  if (deleteOptionIds.length) {
    await connection.query(`DELETE FROM product_options WHERE product_id = ? AND id IN (${deleteOptionIds.map(() => "?").join(",")})`, [
      productId,
      ...deleteOptionIds
    ]);
  }

  const cleaned = options
    .filter((option) => (!option.id || !deleteOptionIds.includes(option.id)) && option.label.trim() && option.priceCents >= 0)
    .map((option, index) => ({ ...option, sortOrder: index }));

  if (!cleaned.length) return;

  const hasDefault = cleaned.some((option) => option.isDefault);
  if (!hasDefault) cleaned[0].isDefault = true;

  for (const option of cleaned) {
    if (option.id) {
      await connection.query(
        `UPDATE product_options
         SET label = ?, selling_unit = ?, price_cents = ?, compare_at_cents = ?, cost_cents = ?, stock_multiplier = ?, is_default = ?, sort_order = ?
         WHERE id = ? AND product_id = ?`,
        [
          option.label, option.sellingUnit, option.priceCents, option.compareAtCents ?? null, option.costCents,
          option.stockMultiplier, option.isDefault, option.sortOrder, option.id, productId
        ]
      );
    } else {
      await connection.query(
        `INSERT INTO product_options
         (id, product_id, label, selling_unit, price_cents, compare_at_cents, cost_cents, stock_multiplier, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id("opt"), productId, option.label, option.sellingUnit, option.priceCents, option.compareAtCents ?? null,
          option.costCents, option.stockMultiplier, option.isDefault, option.sortOrder
        ]
      );
    }
  }

  const defaults = await connection.query("SELECT id FROM product_options WHERE product_id = ? AND is_default = TRUE ORDER BY sort_order ASC", [productId]) as { id: string }[];
  if (defaults.length > 1) {
    await connection.query(
      `UPDATE product_options SET is_default = FALSE WHERE product_id = ? AND id IN (${defaults.slice(1).map(() => "?").join(",")})`,
      [productId, ...defaults.slice(1).map((row) => row.id)]
    );
  }
}

type ProductListFilters = {
  q?: string;
  category?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
  excludeId?: string;
  status?: string;
  includeInactive?: boolean;
};

function productWhere(filters: ProductListFilters) {
  const where = filters.includeInactive ? ["1 = 1"] : ["p.is_active = TRUE"];
  const values: unknown[] = [];

  if (filters.status === "active") where.push("p.is_active = TRUE");
  if (filters.status === "hidden") where.push("p.is_active = FALSE");
  if (filters.status === "low") where.push("p.stock_quantity <= p.low_stock_threshold");

  if (filters.category) {
    where.push("c.slug = ?");
    values.push(filters.category);
  }

  if (filters.categoryId) {
    where.push("p.category_id = ?");
    values.push(filters.categoryId);
  }

  if (filters.excludeId) {
    where.push("p.id <> ?");
    values.push(filters.excludeId);
  }

  const normalizedQuery = filters.q?.trim().toLowerCase() ?? "";
  const isHotDealSearch = /^(hot\s*)?deals?$/.test(normalizedQuery) || normalizedQuery === "offers" || normalizedQuery === "promotions";
  const terms = isHotDealSearch ? [] : filters.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (isHotDealSearch) {
    where.push("p.is_hot_deal = TRUE");
  }
  for (const term of terms) {
    where.push(`(
      p.name LIKE ? OR p.slug LIKE ? OR p.brand LIKE ? OR p.short_description LIKE ? OR
      p.description LIKE ? OR p.seo_title LIKE ? OR p.seo_description LIKE ? OR p.seo_keywords LIKE ? OR c.name LIKE ?
    )`);
    values.push(...Array(9).fill(`%${term}%`));
  }

  return { where, values };
}

async function countProducts(filters: ProductListFilters = {}) {
  const { where, values } = productWhere(filters);
  const rows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(" AND ")}`,
    values
  );
  return Number(rows[0]?.count ?? 0);
}

async function listProducts(filters: ProductListFilters = {}) {
  const { where, values } = productWhere(filters);

  const maxLimit = 2000;
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), maxLimit);
  const offset = Math.max(filters.offset ?? 0, 0);
  values.push(limit, offset);

  const rows = await query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p
     JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.is_featured DESC, p.is_hot_deal DESC, p.updated_at DESC
     LIMIT ? OFFSET ?`,
    values
  );
  const [imageMap, optionMap] = await Promise.all([
    imagesForProducts(rows.map((row) => row.id)),
    optionsForProducts(rows.map((row) => row.id))
  ]);
  return rows.map((row) => mapProduct(row, imageMap.get(row.id) ?? [], optionMap.get(row.id) ?? []));
}

function publicUser(row: { id: string; name: string; email: string; phone: string | null; role: string; created_at?: Date }) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role, createdAt: row.created_at };
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function money(cents: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(cents / 100);
}

function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reportWindow(date: string) {
  return {
    start: new Date(`${date}T00:00:00+03:00`),
    end: new Date(`${date}T23:59:59.999+03:00`)
  };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "sunspark-api" });
});

app.get("/health/config", (_request, response) => {
  response.json({
    ok: true,
    service: "sunspark-api",
    configured: {
      database: Boolean(env("DATABASE_URL")),
      adminApiToken: Boolean(adminApiToken),
      frontendOrigin: allowedOrigins.length > 0,
      mailer: Boolean(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASSWORD"))
    }
  });
});

app.get("/settings", asyncRoute(async (_request, response) => {
  const rows = await query("SELECT * FROM site_settings WHERE id = 'default' LIMIT 1");
  response.json(rows[0] ?? null);
}));

app.patch("/admin/settings", asyncRoute(async (request, response) => {
  const input = z.object({
    storeName: cleanText(120).min(2),
    supportEmail: z.string().email(),
    reportEmail: z.string().email(),
    whatsappPhone: cleanText(30).min(6),
    currency: cleanText(10).default("KSH")
  }).parse(request.body);

  await execute(
    `INSERT INTO site_settings (id, store_name, support_email, report_email, whatsapp_phone, currency)
     VALUES ('default', ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       store_name = VALUES(store_name),
       support_email = VALUES(support_email),
       report_email = VALUES(report_email),
       whatsapp_phone = VALUES(whatsapp_phone),
       currency = VALUES(currency)`,
    [input.storeName, input.supportEmail, input.reportEmail, input.whatsappPhone, input.currency]
  );

  response.json({ ok: true });
}));

app.get("/categories", asyncRoute(async (_request, response) => {
  const rows = await query<CategoryRow>(
    `SELECT c.*, COALESCE(pc.product_count, 0) AS product_count
     FROM categories c
     LEFT JOIN (
       SELECT category_id, COUNT(*) AS product_count
       FROM products
       WHERE is_active = TRUE
       GROUP BY category_id
     ) pc ON pc.category_id = c.id
     WHERE c.parent_id IS NULL AND c.is_active = TRUE
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  const imageMap = await imagesForCategories(rows.map((row) => row.id));
  response.json(rows.map((row) => mapCategory(row, imageMap.get(row.id) ?? [])));
}));

app.get("/admin/categories", asyncRoute(async (request, response) => {
  const q = String(request.query.q ?? "").trim();
  const status = String(request.query.status ?? "");
  const where = ["parent_id IS NULL"];
  const values: unknown[] = [];

  if (q) {
    where.push("(name LIKE ? OR slug LIKE ? OR description LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === "active") where.push("is_active = TRUE");
  if (status === "hidden") where.push("is_active = FALSE");

  const rows = await query<CategoryRow>(
    `SELECT c.*, COALESCE(pc.product_count, 0) AS product_count
     FROM categories c
     LEFT JOIN (
       SELECT category_id, COUNT(*) AS product_count
       FROM products
       GROUP BY category_id
     ) pc ON pc.category_id = c.id
     WHERE ${where.map((condition) => condition.replace(/\bparent_id\b/g, "c.parent_id").replace(/\bname\b/g, "c.name").replace(/\bslug\b/g, "c.slug").replace(/\bdescription\b/g, "c.description").replace(/\bis_active\b/g, "c.is_active")).join(" AND ")}
     ORDER BY c.sort_order ASC, c.name ASC`,
    values
  );
  const imageMap = await imagesForCategories(rows.map((row) => row.id));
  response.json(rows.map((row) => {
    const category = mapCategory(row, imageMap.get(row.id) ?? []);
    return { ...category, _count: { products: category.productCount } };
  }));
}));

app.get("/admin/categories/:id", asyncRoute(async (request, response) => {
  const rows = await query<CategoryRow>("SELECT * FROM categories WHERE id = ? LIMIT 1", [request.params.id]);
  if (!rows[0]) throw new HttpError(404, "Category not found.");
  const imageMap = await imagesForCategories([rows[0].id]);
  response.json(mapCategory(rows[0], imageMap.get(rows[0].id) ?? []));
}));

app.get("/categories/:slug", asyncRoute(async (request, response) => {
  const rows = await query<CategoryRow>("SELECT * FROM categories WHERE slug = ? AND is_active = TRUE LIMIT 1", [request.params.slug]);
  const category = rows[0];
  if (!category) throw new HttpError(404, "Category not found.");

  const [childrenRows, products, imageMap] = await Promise.all([
    query<CategoryRow>("SELECT * FROM categories WHERE parent_id = ? AND is_active = TRUE ORDER BY sort_order ASC, name ASC", [category.id]),
    listProducts({ categoryId: category.id, limit: 60 }),
    imagesForCategories([category.id])
  ]);
  response.json(mapCategory(category, imageMap.get(category.id) ?? [], products, childrenRows.map((row) => mapCategory(row))));
}));

app.get("/products", asyncRoute(async (request, response) => {
  response.json(await listProducts({
    q: String(request.query.q ?? ""),
    category: String(request.query.category ?? ""),
    limit: Number(request.query.limit ?? 120)
  }));
}));

app.get("/admin/products", asyncRoute(async (request, response) => {
  const page = Math.max(Number(request.query.page ?? 1) || 1, 1);
  const perPage = Math.min(Math.max(Number(request.query.perPage ?? 25) || 25, 1), 100);
  const filters = {
    q: String(request.query.q ?? ""),
    category: String(request.query.category ?? ""),
    status: String(request.query.status ?? ""),
    limit: perPage,
    offset: (page - 1) * perPage,
    includeInactive: true
  };
  const [products, total] = await Promise.all([listProducts(filters), countProducts(filters)]);
  response.json({ products, total, page, perPage });
}));

app.get("/products/by-slugs", asyncRoute(async (request, response) => {
  const slugs = String(request.query.slugs ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (!slugs.length) {
    response.json([]);
    return;
  }

  const rows = await query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.is_active = TRUE AND p.slug IN (${slugs.map(() => "?").join(",")})
     ORDER BY p.updated_at DESC`,
    slugs
  );
  const [imageMap, optionMap] = await Promise.all([
    imagesForProducts(rows.map((row) => row.id)),
    optionsForProducts(rows.map((row) => row.id))
  ]);
  response.json(rows.map((row) => mapProduct(row, imageMap.get(row.id) ?? [], optionMap.get(row.id) ?? [])));
}));

app.get("/products/:slug", asyncRoute(async (request, response) => {
  const rows = await query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.slug = ? LIMIT 1`,
    [request.params.slug]
  );
  const product = rows[0];
  if (!product) throw new HttpError(404, "Product not found.");
  const [imageMap, optionMap] = await Promise.all([imagesForProducts([product.id]), optionsForProducts([product.id])]);
  response.json(mapProduct(product, imageMap.get(product.id) ?? [], optionMap.get(product.id) ?? []));
}));

app.get("/admin/products/:id", asyncRoute(async (request, response) => {
  const rows = await query<ProductRow>(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE p.id = ? LIMIT 1`,
    [request.params.id]
  );
  if (!rows[0]) throw new HttpError(404, "Product not found.");
  const [imageMap, optionMap] = await Promise.all([imagesForProducts([rows[0].id]), optionsForProducts([rows[0].id])]);
  response.json(mapProduct(rows[0], imageMap.get(rows[0].id) ?? [], optionMap.get(rows[0].id) ?? []));
}));

app.get("/products/:id/related", asyncRoute(async (request, response) => {
  const productId = String(request.params.id);
  const rows = await query<ProductRow>("SELECT category_id FROM products WHERE id = ? LIMIT 1", [productId]);
  if (!rows[0]) throw new HttpError(404, "Product not found.");
  response.json(await listProducts({ categoryId: rows[0].category_id, excludeId: productId, limit: 8 }));
}));

app.get("/products/:id/companions", asyncRoute(async (request, response) => {
  const productId = String(request.params.id);
  const rows = await query<ProductRow>("SELECT category_id FROM products WHERE id = ? LIMIT 1", [productId]);
  if (!rows[0]) throw new HttpError(404, "Product not found.");
  const products = await listProducts({ excludeId: productId, limit: 12 });
  response.json(products.filter((product) => product.categoryId !== rows[0].category_id).slice(0, 8));
}));

app.get("/home", asyncRoute(async (_request, response) => {
  const categoryRows = await query<CategoryRow>(
    `SELECT c.*, COALESCE(pc.product_count, 0) AS product_count
     FROM categories c
     LEFT JOIN (
       SELECT category_id, COUNT(*) AS product_count
       FROM products
       WHERE is_active = TRUE
       GROUP BY category_id
     ) pc ON pc.category_id = c.id
     WHERE c.parent_id IS NULL AND c.is_active = TRUE
     ORDER BY c.sort_order ASC, c.name ASC`
  );
  const categoryImages = await imagesForCategories(categoryRows.map((row) => row.id));
  const categories = categoryRows.map((row) => mapCategory(row, categoryImages.get(row.id) ?? []));
  const categorySections = await Promise.all(categoryRows.map(async (row) => ({
    ...mapCategory(row, categoryImages.get(row.id) ?? []),
    products: await listProducts({ categoryId: row.id, limit: 24 })
  })));
  const products = await listProducts({ limit: 24 });
  const brandRows = await query<{ brand: string }>(
    "SELECT DISTINCT brand FROM products WHERE is_active = TRUE AND brand IS NOT NULL AND brand <> '' ORDER BY brand ASC LIMIT 20"
  );

  response.json({ categories, categorySections, products, brands: brandRows.map((row) => row.brand) });
}));

app.get("/admin/stats", asyncRoute(async (_request, response) => {
  const [products, orders, customers, lowStock] = await Promise.all([
    query<{ count: number }>("SELECT COUNT(*) AS count FROM products"),
    query<{ count: number }>("SELECT COUNT(*) AS count FROM orders"),
    query<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE role = 'CUSTOMER'"),
    query<{ count: number }>("SELECT COUNT(*) AS count FROM products WHERE stock_quantity <= low_stock_threshold")
  ]);

  response.json({
    products: Number(products[0]?.count ?? 0),
    orders: Number(orders[0]?.count ?? 0),
    customers: Number(customers[0]?.count ?? 0),
    lowStock: Number(lowStock[0]?.count ?? 0)
  });
}));

app.get("/admin/sales-summary", asyncRoute(async (request, response) => {
  const period = ["days", "weeks", "months"].includes(String(request.query.period)) ? String(request.query.period) : "days";
  const limit = period === "months" ? 5 : period === "weeks" ? 4 : 7;
  const dateExpression = period === "months"
    ? "DATE_FORMAT(o.created_at, '%Y-%m-01')"
    : period === "weeks"
      ? "DATE_SUB(DATE(o.created_at), INTERVAL WEEKDAY(o.created_at) DAY)"
      : "DATE(o.created_at)";
  const startCondition = period === "months"
    ? "o.created_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 4 MONTH)"
    : period === "weeks"
      ? "o.created_at >= DATE_SUB(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 3 WEEK)"
      : "o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)";

  const rows = await query<{ bucket: string; orders: number; salesCents: number; profitCents: number }>(
    `SELECT ${dateExpression} AS bucket,
       COUNT(DISTINCT o.id) AS orders,
       COALESCE(SUM(oi.total_cents), 0) AS salesCents,
       COALESCE(SUM(oi.total_cents - (oi.cost_cents * oi.quantity)), 0) AS profitCents
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE ${startCondition}
       AND o.status <> 'CANCELLED'
     GROUP BY bucket
     ORDER BY bucket ASC`,
  );
  const rowMap = new Map(rows.map((row) => [new Date(row.bucket).toISOString().slice(0, 10), row]));
  const buckets = Array.from({ length: limit }, (_, index) => {
    const date = new Date();
    if (period === "months") {
      date.setDate(1);
      date.setMonth(date.getMonth() - (limit - 1 - index));
    } else if (period === "weeks") {
      const day = date.getDay() || 7;
      date.setDate(date.getDate() - day + 1 - 7 * (limit - 1 - index));
    } else {
      date.setDate(date.getDate() - (limit - 1 - index));
    }
    const key = date.toISOString().slice(0, 10);
    const row = rowMap.get(key);
    return {
      bucket: key,
      label: period === "months"
        ? date.toLocaleDateString("en-KE", { month: "short" })
        : period === "weeks"
          ? `Wk ${date.toLocaleDateString("en-KE", { day: "2-digit", month: "short" })}`
          : date.toLocaleDateString("en-KE", { weekday: "short" }),
      orders: Number(row?.orders ?? 0),
      salesCents: Number(row?.salesCents ?? 0),
      profitCents: Number(row?.profitCents ?? 0)
    };
  });

  response.json({ period, buckets });
}));

app.get("/admin/dashboard-overview", asyncRoute(async (_request, response) => {
  const [salesRows, customerRows, categoryRows, productRows, recentOrders, inventoryRows] = await Promise.all([
    query<{
      currentSalesCents: number | string;
      previousSalesCents: number | string;
      currentProfitCents: number | string;
      previousProfitCents: number | string;
      currentOrders: number | string;
      previousOrders: number | string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.total_cents ELSE 0 END), 0) AS currentSalesCents,
         COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND o.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.total_cents ELSE 0 END), 0) AS previousSalesCents,
         COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.total_cents - (oi.cost_cents * oi.quantity) ELSE 0 END), 0) AS currentProfitCents,
         COALESCE(SUM(CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND o.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN oi.total_cents - (oi.cost_cents * oi.quantity) ELSE 0 END), 0) AS previousProfitCents,
         COUNT(DISTINCT CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN o.id END) AS currentOrders,
         COUNT(DISTINCT CASE WHEN o.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND o.created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN o.id END) AS previousOrders
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
         AND o.status <> 'CANCELLED'`
    ),
    query<{ currentCustomers: number | string; previousCustomers: number | string }>(
      `SELECT
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) AS currentCustomers,
         COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) AS previousCustomers
       FROM users
       WHERE role = 'CUSTOMER' AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)`
    ),
    query<{ name: string; salesCents: number | string; units: number | string }>(
      `SELECT COALESCE(c.name, 'Other') AS name,
         COALESCE(SUM(oi.total_cents), 0) AS salesCents,
         COALESCE(SUM(oi.quantity), 0) AS units
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND o.status <> 'CANCELLED'
       GROUP BY COALESCE(c.name, 'Other')
       ORDER BY salesCents DESC
       LIMIT 6`
    ),
    query<{ productId: string | null; name: string; salesCents: number | string; units: number | string }>(
      `SELECT oi.product_id AS productId, oi.product_name AS name,
         COALESCE(SUM(oi.total_cents), 0) AS salesCents,
         COALESCE(SUM(oi.quantity), 0) AS units
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND o.status <> 'CANCELLED'
       GROUP BY oi.product_id, oi.product_name
       ORDER BY salesCents DESC
       LIMIT 5`
    ),
    query<{ id: string; orderNumber: string; customerName: string; totalCents: number; status: string; createdAt: Date }>(
      `SELECT id, order_number AS orderNumber, customer_name AS customerName,
         total_cents AS totalCents, status, created_at AS createdAt
       FROM orders
       ORDER BY created_at DESC
       LIMIT 6`
    ),
    query<{ total: number | string; healthy: number | string; low: number | string; outOfStock: number | string }>(
      `SELECT COUNT(*) AS total,
         COUNT(CASE WHEN stock_quantity > low_stock_threshold THEN 1 END) AS healthy,
         COUNT(CASE WHEN stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 END) AS low,
         COUNT(CASE WHEN stock_quantity <= 0 THEN 1 END) AS outOfStock
       FROM products
       WHERE is_active = TRUE`
    )
  ]);

  const sales = salesRows[0];
  const customers = customerRows[0];
  const inventory = inventoryRows[0];
  const currentSalesCents = Number(sales?.currentSalesCents ?? 0);
  const currentOrders = Number(sales?.currentOrders ?? 0);

  response.json({
    metrics: {
      salesCents: currentSalesCents,
      previousSalesCents: Number(sales?.previousSalesCents ?? 0),
      profitCents: Number(sales?.currentProfitCents ?? 0),
      previousProfitCents: Number(sales?.previousProfitCents ?? 0),
      orders: currentOrders,
      previousOrders: Number(sales?.previousOrders ?? 0),
      customers: Number(customers?.currentCustomers ?? 0),
      previousCustomers: Number(customers?.previousCustomers ?? 0),
      averageOrderCents: currentOrders ? Math.round(currentSalesCents / currentOrders) : 0
    },
    categories: categoryRows.map((row) => ({ name: row.name, salesCents: Number(row.salesCents), units: Number(row.units) })),
    topProducts: productRows.map((row) => ({ ...row, salesCents: Number(row.salesCents), units: Number(row.units) })),
    recentOrders: recentOrders.map((row) => ({ ...row, totalCents: Number(row.totalCents) })),
    inventory: {
      total: Number(inventory?.total ?? 0),
      healthy: Number(inventory?.healthy ?? 0),
      low: Number(inventory?.low ?? 0),
      outOfStock: Number(inventory?.outOfStock ?? 0)
    }
  });
}));

app.get("/campaigns", asyncRoute(async (_request, response) => {
  const rows = await query<CampaignRow>(
    "SELECT * FROM campaigns WHERE is_active = TRUE AND (ends_at IS NULL OR ends_at > NOW()) ORDER BY updated_at DESC LIMIT 3"
  );
  response.json(rows.map(mapCampaign));
}));

app.get("/admin/campaigns", asyncRoute(async (_request, response) => {
  const rows = await query<CampaignRow>("SELECT * FROM campaigns ORDER BY updated_at DESC LIMIT 100");
  response.json(rows.map(mapCampaign));
}));

app.get("/admin/customers", asyncRoute(async (request, response) => {
  const q = String(request.query.q ?? "").trim();
  const where = ["role = 'CUSTOMER'"];
  const values: unknown[] = [];
  if (q) {
    where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at AS createdAt, u.updated_at AS updatedAt,
       COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status <> 'CANCELLED' THEN o.total_cents ELSE 0 END), 0) AS spentCents
     FROM users u
     LEFT JOIN orders o ON o.user_id = u.id
     WHERE ${where.map((condition) => condition.replace(/\b(role|name|email|phone)\b/g, "u.$1")).join(" AND ")}
     GROUP BY u.id, u.name, u.email, u.phone, u.role, u.created_at, u.updated_at
     ORDER BY u.created_at DESC LIMIT 200`,
    values
  );
  response.json(rows);
}));

app.post("/admin/categories", asyncRoute(async (request, response) => {
  const input = z.object({
    name: cleanText(120).min(2),
    slug: slugInput,
    description: optionalText(800),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
    images: z.array(uploadedImageInput).max(8).default([])
  }).parse(request.body);
  await assertUniqueCategorySlug(input.slug);
  const categoryId = id("cat");
  await transaction(async (connection) => {
    await connection.query(
      "INSERT INTO categories (id, name, slug, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [categoryId, input.name, input.slug, input.description ?? null, input.sortOrder, input.isActive]
    );
    for (const image of input.images) {
      await connection.query(
        "INSERT INTO category_images (id, category_id, url, alt, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [id("cim"), categoryId, image.url, image.alt ?? null, image.isPrimary, image.sortOrder]
      );
    }
  });
  response.status(201).json({ id: categoryId });
}));

app.patch("/admin/categories/:id", asyncRoute(async (request, response) => {
  const input = z.object({
    name: cleanText(120).min(2),
    slug: slugInput,
    description: optionalText(800),
    sortOrder: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
    images: z.array(uploadedImageInput).max(8).default([]),
    deleteImageIds: z.array(idInput).max(20).default([]),
    primaryImageId: idInput.optional().nullable()
  }).parse(request.body);
  await assertUniqueCategorySlug(input.slug, routeParam(request.params.id));
  await transaction(async (connection) => {
    await connection.query(
      "UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?",
      [input.name, input.slug, input.description ?? null, input.sortOrder, input.isActive, request.params.id]
    );
    if (input.deleteImageIds.length) {
      await connection.query(`DELETE FROM category_images WHERE category_id = ? AND id IN (${input.deleteImageIds.map(() => "?").join(",")})`, [
        request.params.id,
        ...input.deleteImageIds
      ]);
    }
    const countRows = await connection.query("SELECT COUNT(*) AS count FROM category_images WHERE category_id = ?", [request.params.id]) as { count: number }[];
    const existingCount = Number(countRows[0]?.count ?? 0);
    for (const [index, image] of input.images.entries()) {
      await connection.query(
        "INSERT INTO category_images (id, category_id, url, alt, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [id("cim"), request.params.id, image.url, image.alt ?? null, existingCount === 0 && index === 0, existingCount + index]
      );
    }
    if (input.primaryImageId) {
      await connection.query("UPDATE category_images SET is_primary = FALSE WHERE category_id = ?", [request.params.id]);
      await connection.query("UPDATE category_images SET is_primary = TRUE WHERE id = ?", [input.primaryImageId]);
    }
  });
  response.json({ ok: true });
}));

app.post("/admin/reports/daily-email", asyncRoute(async (request, response) => {
  const input = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.body);
  const { start, end } = reportWindow(input.date);
  const [settingsRows, orderRows, itemRows] = await Promise.all([
    query<{ report_email: string | null }>("SELECT report_email FROM site_settings WHERE id = 'default' LIMIT 1"),
    query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM orders WHERE created_at BETWEEN ? AND ? AND status <> 'CANCELLED'",
      [start, end]
    ),
    query<{ name: string; quantity: number; revenueCents: number; costCents: number; profitCents: number }>(
      `SELECT
         oi.product_name AS name,
         SUM(oi.quantity) AS quantity,
         SUM(oi.total_cents) AS revenueCents,
         SUM(oi.cost_cents * oi.quantity) AS costCents,
         SUM(oi.total_cents - (oi.cost_cents * oi.quantity)) AS profitCents
       FROM order_items oi
       INNER JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at BETWEEN ? AND ? AND o.status <> 'CANCELLED'
       GROUP BY oi.product_id, oi.product_name
       ORDER BY revenueCents DESC`,
      [start, end]
    )
  ]);

  const to = settingsRows[0]?.report_email || env("REPORT_EMAIL", "sunsparkelectricalsandsolar@gmail.com");
  const orders = Number(orderRows[0]?.count ?? 0);
  const items = itemRows.map((item) => ({
    name: item.name,
    quantity: Number(item.quantity ?? 0),
    revenueCents: Number(item.revenueCents ?? 0),
    costCents: Number(item.costCents ?? 0),
    profitCents: Number(item.profitCents ?? 0)
  }));
  const revenueCents = items.reduce((sum, item) => sum + item.revenueCents, 0);
  const profitCents = items.reduce((sum, item) => sum + item.profitCents, 0);
  const rows = items.length
    ? items.map((item) => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>${money(item.revenueCents)}</td><td>${money(item.costCents)}</td><td><strong>${money(item.profitCents)}</strong></td></tr>`).join("")
    : `<tr><td colspan="5">No completed sales for this date.</td></tr>`;

  await sendEmail({
    to,
    subject: `Sunspark daily report - ${input.date}`,
    text: `Sunspark daily report for ${input.date}\nOrders: ${orders}\nRevenue: ${money(revenueCents)}\nGross profit: ${money(profitCents)}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.45">
        <h2 style="margin:0 0 8px">Sunspark Daily Report</h2>
        <p style="margin:0 0 16px;color:#64748b">${input.date}</p>
        <div style="display:flex;gap:12px;margin-bottom:18px">
          <div><strong>Completed sales</strong><br>${orders}</div>
          <div><strong>Revenue</strong><br>${money(revenueCents)}</div>
          <div><strong>Gross profit</strong><br>${money(profitCents)}</div>
        </div>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
          <thead><tr style="background:#0f65c8;color:#fff"><th align="left">Product</th><th align="left">Qty</th><th align="left">Revenue</th><th align="left">Buying cost</th><th align="left">Profit</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `
  });

  response.json({ ok: true, to });
}));

app.patch("/admin/categories/:id/hide", asyncRoute(async (request, response) => {
  await execute("UPDATE categories SET is_active = FALSE WHERE id = ?", [request.params.id]);
  response.json({ ok: true });
}));

app.delete("/admin/categories/:id", asyncRoute(async (request, response) => {
  const linkedRows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM draft_document_items ddi
     INNER JOIN products p ON p.id = ddi.product_id
     WHERE p.category_id = ?`,
    [request.params.id]
  );
  if (Number(linkedRows[0]?.count ?? 0) > 0) {
    throw new HttpError(409, "This category has products used on invoices or quotations. Hide it instead, or remove those document items first.");
  }

  await transaction(async (connection) => {
    await connection.query("DELETE FROM products WHERE category_id = ?", [request.params.id]);
    const result = await connection.query("DELETE FROM categories WHERE id = ?", [request.params.id]) as { affectedRows?: number };
    if (!result.affectedRows) throw new HttpError(404, "Category not found.");
  });
  response.status(204).send();
}));

app.post("/admin/uploads", asyncRoute(async (request, response) => {
  const input = z.object({
    folder: z.enum(["products", "categories"]),
    name: z.string().min(1).default("Image"),
    files: z.array(z.object({
      filename: z.string().optional().default("image"),
      type: z.string(),
      dataBase64: z.string().min(1)
    })).max(8)
  }).parse(request.body);

  const targetDir = path.join(uploadRoot, input.folder);
  await mkdir(targetDir, { recursive: true });

  const images = [];
  for (const file of input.files) {
    const extension = uploadContentTypes.get(file.type);
    if (!extension) throw new HttpError(400, "Images must be JPEG, PNG, or WebP.");

    const buffer = Buffer.from(file.dataBase64, "base64");
    if (!buffer.byteLength || buffer.byteLength > maxUploadBytes) {
      throw new HttpError(400, `Each image must be smaller than ${maxUploadMb} MB.`);
    }

    const optimized = await optimizeUploadedImage(buffer, file.type.toLowerCase());
    const filename = `${crypto.randomUUID()}-${safeUploadName(file.filename).replace(/\.[a-z0-9]+$/i, "")}.${extension}`;
    await writeFile(path.join(targetDir, filename), optimized, { flag: "wx" });
    images.push({
      url: `/uploads/${input.folder}/${filename}`,
      alt: input.name
    });
  }

  response.status(201).json({ images });
}));

const productOptionSchema = z.object({
  id: idInput.optional().nullable(),
  label: cleanText(80).min(1),
  sellingUnit: cleanText(30).default("UNIT"),
  priceCents: z.number().int().min(0),
  compareAtCents: z.number().int().optional().nullable(),
  costCents: z.number().int().min(0).default(0),
  stockMultiplier: z.number().positive().max(100000).default(1),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0)
});

app.post("/admin/products", asyncRoute(async (request, response) => {
  const input = z.object({
    name: cleanText(180).min(2),
    slug: slugInput,
    brand: optionalText(80),
    categoryId: idInput,
    shortDescription: optionalText(260),
    description: optionalText(5000),
    priceCents: z.number().int().min(0),
    compareAtCents: z.number().int().optional().nullable(),
    costCents: z.number().int().min(0).default(0),
    sellingUnit: cleanText(30).default("UNIT"),
    stockQuantity: z.number().int().min(0).default(0),
    lowStockThreshold: z.number().int().min(0).default(5),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    isHotDeal: z.boolean().default(false),
    seoTitle: optionalText(180),
    seoDescription: optionalText(320),
    seoKeywords: optionalText(300),
    options: z.array(productOptionSchema).max(12).default([]),
    images: z.array(uploadedImageInput).max(8).default([])
  }).parse(request.body);
  await assertUniqueProductSlug(input.slug);
  const productId = id("prd");
  await transaction(async (connection) => {
    await connection.query(
      `INSERT INTO products
       (id, name, slug, brand, category_id, short_description, description, price_cents, compare_at_cents,
        cost_cents, selling_unit, stock_quantity, low_stock_threshold, is_active, is_featured, is_hot_deal,
        seo_title, seo_description, seo_keywords)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        productId, input.name, input.slug, input.brand ?? null, input.categoryId,
        input.shortDescription ?? null, input.description ?? null, input.priceCents, input.compareAtCents ?? null,
        input.costCents, input.sellingUnit, input.stockQuantity, input.lowStockThreshold, input.isActive,
        input.isFeatured, input.isHotDeal, input.seoTitle ?? null, input.seoDescription ?? null, input.seoKeywords ?? null
      ]
    );
    if (input.options.length) {
      await syncProductOptions(connection, productId, input.options);
    } else {
      await ensureDefaultOption(connection, productId, {
        sellingUnit: input.sellingUnit,
        priceCents: input.priceCents,
        compareAtCents: input.compareAtCents ?? null,
        costCents: input.costCents
      });
    }
    for (const image of input.images) {
      await connection.query(
        "INSERT INTO product_images (id, product_id, url, alt, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [id("pim"), productId, image.url, image.alt ?? null, image.isPrimary, image.sortOrder]
      );
    }
  });
  response.status(201).json({ id: productId });
}));

app.patch("/admin/products/:id", asyncRoute(async (request, response) => {
  const input = z.object({
    name: cleanText(180).min(2),
    slug: slugInput,
    brand: optionalText(80),
    categoryId: idInput,
    shortDescription: optionalText(260),
    description: optionalText(5000),
    priceCents: z.number().int().min(0),
    compareAtCents: z.number().int().optional().nullable(),
    costCents: z.number().int().min(0).default(0),
    sellingUnit: cleanText(30).default("UNIT"),
    stockQuantity: z.number().int().min(0).default(0),
    lowStockThreshold: z.number().int().min(0).default(5),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    isHotDeal: z.boolean().default(false),
    seoTitle: optionalText(180),
    seoDescription: optionalText(320),
    seoKeywords: optionalText(300),
    options: z.array(productOptionSchema).max(12).default([]),
    deleteOptionIds: z.array(idInput).max(20).default([]),
    images: z.array(uploadedImageInput.pick({ url: true, alt: true })).max(8).default([]),
    deleteImageIds: z.array(idInput).max(20).default([]),
    primaryImageId: idInput.optional().nullable()
  }).parse(request.body);
  await assertUniqueProductSlug(input.slug, routeParam(request.params.id));
  await transaction(async (connection) => {
    await connection.query(
      `UPDATE products SET name = ?, slug = ?, brand = ?, category_id = ?, short_description = ?,
       description = ?, price_cents = ?, compare_at_cents = ?, cost_cents = ?, selling_unit = ?, stock_quantity = ?,
       low_stock_threshold = ?, is_active = ?, is_featured = ?, is_hot_deal = ?, seo_title = ?, seo_description = ?,
       seo_keywords = ? WHERE id = ?`,
      [
        input.name, input.slug, input.brand ?? null, input.categoryId,
        input.shortDescription ?? null, input.description ?? null, input.priceCents, input.compareAtCents ?? null,
        input.costCents, input.sellingUnit, input.stockQuantity, input.lowStockThreshold, input.isActive,
        input.isFeatured, input.isHotDeal, input.seoTitle ?? null, input.seoDescription ?? null, input.seoKeywords ?? null,
        request.params.id
      ]
    );
    if (input.options.length || input.deleteOptionIds.length) {
      await syncProductOptions(connection, routeParam(request.params.id), input.options, input.deleteOptionIds);
    } else {
      await ensureDefaultOption(connection, routeParam(request.params.id), {
        sellingUnit: input.sellingUnit,
        priceCents: input.priceCents,
        compareAtCents: input.compareAtCents ?? null,
        costCents: input.costCents
      });
    }
    if (input.deleteImageIds.length) {
      await connection.query(`DELETE FROM product_images WHERE product_id = ? AND id IN (${input.deleteImageIds.map(() => "?").join(",")})`, [
        request.params.id,
        ...input.deleteImageIds
      ]);
    }
    const countRows = await connection.query("SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?", [request.params.id]) as { count: number }[];
    const existingCount = Number(countRows[0]?.count ?? 0);
    for (const [index, image] of input.images.entries()) {
      await connection.query(
        "INSERT INTO product_images (id, product_id, url, alt, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [id("pim"), request.params.id, image.url, image.alt ?? null, existingCount === 0 && index === 0, existingCount + index]
      );
    }
    if (input.primaryImageId) {
      await connection.query("UPDATE product_images SET is_primary = FALSE WHERE product_id = ?", [request.params.id]);
      await connection.query("UPDATE product_images SET is_primary = TRUE WHERE id = ?", [input.primaryImageId]);
    }
  });
  response.json({ ok: true });
}));

app.patch("/admin/products/:id/hide", asyncRoute(async (request, response) => {
  await execute("UPDATE products SET is_active = FALSE WHERE id = ?", [request.params.id]);
  response.json({ ok: true });
}));

app.delete("/admin/products/:id", asyncRoute(async (request, response) => {
  const draftRows = await query<{ count: number }>("SELECT COUNT(*) AS count FROM draft_document_items WHERE product_id = ?", [request.params.id]);
  if (Number(draftRows[0]?.count ?? 0) > 0) {
    throw new HttpError(409, "This product is used on an invoice or quotation. Hide it instead, or remove it from those documents first.");
  }

  const result = await execute("DELETE FROM products WHERE id = ?", [request.params.id]) as { affectedRows?: number };
  if (!result.affectedRows) throw new HttpError(404, "Product not found.");
  response.status(204).send();
}));

app.post("/admin/campaigns", asyncRoute(async (request, response) => {
  const input = z.object({
    title: cleanText(140).min(2),
    description: optionalText(900),
    imageUrl: imageUrlInput.optional().nullable(),
    badge: optionalText(60),
    offerLabel: optionalText(100),
    ctaLabel: optionalText(60),
    ctaUrl: optionalUrl,
    endsAt: z.string().optional().nullable(),
    isActive: z.boolean().default(true)
  }).parse(request.body);
  const campaignId = id("cmp");
  await execute(
    "INSERT INTO campaigns (id, title, description, image_url, badge, offer_label, cta_label, cta_url, ends_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [campaignId, input.title, input.description ?? null, input.imageUrl ?? null, input.badge ?? null, input.offerLabel ?? null, input.ctaLabel ?? null, input.ctaUrl ?? null, input.endsAt ? new Date(input.endsAt) : null, input.isActive]
  );
  response.status(201).json({ id: campaignId });
}));

app.patch("/admin/campaigns/:id", asyncRoute(async (request, response) => {
  const input = z.object({
    title: cleanText(140).min(2),
    description: optionalText(900),
    imageUrl: imageUrlInput.optional().nullable(),
    badge: optionalText(60),
    offerLabel: optionalText(100),
    ctaLabel: optionalText(60),
    ctaUrl: optionalUrl,
    endsAt: z.string().optional().nullable(),
    isActive: z.boolean().default(true)
  }).parse(request.body);
  await execute(
    "UPDATE campaigns SET title = ?, description = ?, image_url = COALESCE(?, image_url), badge = ?, offer_label = ?, cta_label = ?, cta_url = ?, ends_at = ?, is_active = ? WHERE id = ?",
    [input.title, input.description ?? null, input.imageUrl ?? null, input.badge ?? null, input.offerLabel ?? null, input.ctaLabel ?? null, input.ctaUrl ?? null, input.endsAt ? new Date(input.endsAt) : null, input.isActive, request.params.id]
  );
  response.json({ ok: true });
}));

app.delete("/admin/campaigns/:id", asyncRoute(async (request, response) => {
  const result = await execute("DELETE FROM campaigns WHERE id = ?", [request.params.id]) as { affectedRows?: number };
  if (!result.affectedRows) throw new HttpError(404, "Campaign not found.");
  response.status(204).send();
}));

app.patch("/admin/orders/:id", asyncRoute(async (request, response) => {
  const input = z.object({
    status: z.enum(["PENDING", "CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"]),
    paymentStatus: z.enum(["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"])
  }).parse(request.body);
  await execute("UPDATE orders SET status = ?, payment_status = ? WHERE id = ?", [input.status, input.paymentStatus, request.params.id]);
  response.json({ ok: true });
}));

function documentReference(kind: "INVOICE" | "QUOTATION") {
  const prefix = kind === "QUOTATION" ? "QUO" : "INV-DRAFT";
  return `${prefix}-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

app.get("/admin/draft-documents", asyncRoute(async (request, response) => {
  const q = String(request.query.q ?? "").trim();
  const where: string[] = [];
  const values: unknown[] = [];

  if (q) {
    where.push("(reference LIKE ? OR customer_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const documents = await query<Record<string, unknown>>(
    `SELECT id, reference, kind, status, order_id AS orderId, customer_name AS customerName,
      customer_email AS customerEmail, customer_phone AS customerPhone, payment_method AS paymentMethod,
      subtotal_cents AS subtotalCents, total_cents AS totalCents, created_at AS createdAt, updated_at AS updatedAt
     FROM draft_documents
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY updated_at DESC
     LIMIT 100`,
    values
  );
  const ids = documents.map((document) => String(document.id));
  const items = ids.length
    ? await query<Record<string, unknown>>(
        `SELECT id, document_id AS documentId, product_id AS productId, product_option_id AS productOptionId,
          product_name AS productName, option_label AS optionLabel, selling_unit AS sellingUnit,
          unit_cents AS unitCents, cost_cents AS costCents, quantity, total_cents AS totalCents, stock_deducted AS stockDeducted
         FROM draft_document_items WHERE document_id IN (${ids.map(() => "?").join(",")})`,
        ids
      )
    : [];

  response.json(documents.map((document) => ({ ...document, items: items.filter((item) => item.documentId === document.id) })));
}));

app.get("/admin/draft-documents/:id", asyncRoute(async (request, response) => {
  const documents = await query<Record<string, unknown>>(
    `SELECT id, reference, kind, status, order_id AS orderId, customer_name AS customerName,
      customer_email AS customerEmail, customer_phone AS customerPhone, payment_method AS paymentMethod,
      subtotal_cents AS subtotalCents, total_cents AS totalCents, created_at AS createdAt, updated_at AS updatedAt
     FROM draft_documents WHERE id = ? LIMIT 1`,
    [request.params.id]
  );
  if (!documents[0]) throw new HttpError(404, "Document not found.");
  const items = await query<Record<string, unknown>>(
    `SELECT id, document_id AS documentId, product_id AS productId, product_option_id AS productOptionId,
      product_name AS productName, option_label AS optionLabel, selling_unit AS sellingUnit,
      unit_cents AS unitCents, cost_cents AS costCents, quantity, total_cents AS totalCents, stock_deducted AS stockDeducted
     FROM draft_document_items WHERE document_id = ?`,
    [request.params.id]
  );
  response.json({ ...documents[0], items });
}));

app.post("/admin/draft-documents", asyncRoute(async (request, response) => {
  const input = z.object({
    kind: z.enum(["INVOICE", "QUOTATION"]),
    customerName: cleanText(140).min(2),
    customerEmail: optionalEmail,
    customerPhone: optionalText(40),
    paymentMethod: z.enum(["WHATSAPP", "MPESA", "CASH"]).default("CASH"),
    items: z.array(z.object({ productId: idInput, productOptionId: idInput.optional().nullable(), quantity: z.number().int().positive().max(100000) })).min(1).max(100)
  }).parse(request.body);
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const rows = await query<ProductRow>(
    `SELECT * FROM products WHERE is_active = TRUE AND id IN (${productIds.map(() => "?").join(",")})`,
    productIds
  );
  if (rows.length !== productIds.length) throw new HttpError(400, "One or more selected products are unavailable.");
  const products = new Map(rows.map((row) => [row.id, row]));
  const optionMap = await optionsForProducts(productIds);
  const documentId = id("doc");
  let totalCents = 0;

  await transaction(async (connection) => {
    const lines = input.items.map((item) => {
      const product = products.get(item.productId);
      if (!product) throw new HttpError(400, "One or more selected products are unavailable.");
      const options = optionMap.get(product.id) ?? [];
      const option = options.find((candidate) => candidate.id === item.productOptionId) ?? options.find((candidate) => truthy(candidate.is_default)) ?? options[0] ?? null;
      const unitCents = option?.price_cents ?? product.price_cents;
      const costCents = option?.cost_cents ?? product.cost_cents;
      const sellingUnit = option?.selling_unit ?? product.selling_unit;
      const stockMultiplier = Number(option?.stock_multiplier ?? 1);
      const optionLabel = option?.label ?? unitLabel(sellingUnit);
      const lineTotal = unitCents * item.quantity;
      const stockDeducted = stockMultiplier * item.quantity;
      totalCents += lineTotal;
      return { product, option, optionLabel, sellingUnit, unitCents, costCents, stockDeducted, quantity: item.quantity, lineTotal };
    });

    await connection.query(
      `INSERT INTO draft_documents
       (id, reference, kind, customer_name, customer_email, customer_phone, payment_method, subtotal_cents, total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        documentReference(input.kind),
        input.kind,
        input.customerName,
        input.customerEmail ?? null,
        input.customerPhone ?? null,
        input.paymentMethod,
        totalCents,
        totalCents
      ]
    );

    for (const line of lines) {
      await connection.query(
        `INSERT INTO draft_document_items
         (id, document_id, product_id, product_option_id, product_name, option_label, selling_unit, unit_cents, cost_cents, quantity, total_cents, stock_deducted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id("dit"), documentId, line.product.id, line.option?.id ?? null, line.product.name, line.optionLabel,
          line.sellingUnit, line.unitCents, line.costCents, line.quantity, line.lineTotal, line.stockDeducted
        ]
      );
    }
  });

  response.status(201).json({ id: documentId });
}));

app.patch("/admin/draft-documents/:id", asyncRoute(async (request, response) => {
  const input = z.object({
    customerName: cleanText(140).min(2),
    customerEmail: optionalEmail,
    customerPhone: optionalText(40),
    paymentMethod: z.enum(["WHATSAPP", "MPESA", "CASH"]).default("CASH"),
    items: z.array(z.object({ productId: idInput, productOptionId: idInput.optional().nullable(), quantity: z.number().int().positive().max(100000) })).min(1).max(100)
  }).parse(request.body);

  const documents = await query<Record<string, unknown>>("SELECT * FROM draft_documents WHERE id = ? LIMIT 1", [request.params.id]);
  const document = documents[0];
  if (!document || document.status !== "DRAFT") throw new HttpError(400, "Only draft invoices and quotations can be edited.");

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const rows = await query<ProductRow>(
    `SELECT * FROM products WHERE is_active = TRUE AND id IN (${productIds.map(() => "?").join(",")})`,
    productIds
  );
  if (rows.length !== productIds.length) throw new HttpError(400, "One or more selected products are unavailable.");

  const products = new Map(rows.map((row) => [row.id, row]));
  const optionMap = await optionsForProducts(productIds);
  const lines = input.items.map((item) => {
    const product = products.get(item.productId);
    if (!product) throw new HttpError(400, "One or more selected products are unavailable.");
    const options = optionMap.get(product.id) ?? [];
    const option = options.find((candidate) => candidate.id === item.productOptionId) ?? options.find((candidate) => truthy(candidate.is_default)) ?? options[0] ?? null;
    const unitCents = option?.price_cents ?? product.price_cents;
    const costCents = option?.cost_cents ?? product.cost_cents;
    const sellingUnit = option?.selling_unit ?? product.selling_unit;
    const optionLabel = option?.label ?? unitLabel(sellingUnit);
    const stockMultiplier = Number(option?.stock_multiplier ?? 1);
    return {
      product,
      option,
      optionLabel,
      sellingUnit,
      unitCents,
      costCents,
      stockDeducted: stockMultiplier * item.quantity,
      quantity: item.quantity,
      totalCents: unitCents * item.quantity
    };
  });
  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);

  await transaction(async (connection) => {
    await connection.query(
      `UPDATE draft_documents
       SET customer_name = ?, customer_email = ?, customer_phone = ?, payment_method = ?, subtotal_cents = ?, total_cents = ?
       WHERE id = ?`,
      [input.customerName, input.customerEmail ?? null, input.customerPhone ?? null, input.paymentMethod, totalCents, totalCents, request.params.id]
    );
    await connection.query("DELETE FROM draft_document_items WHERE document_id = ?", [request.params.id]);
    for (const line of lines) {
      await connection.query(
        `INSERT INTO draft_document_items
         (id, document_id, product_id, product_option_id, product_name, option_label, selling_unit, unit_cents, cost_cents, quantity, total_cents, stock_deducted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id("ddi"), request.params.id, line.product.id, line.option?.id ?? null, line.product.name,
          line.optionLabel, line.sellingUnit, line.unitCents, line.costCents, line.quantity, line.totalCents, line.stockDeducted
        ]
      );
    }
  });

  response.json({ ok: true });
}));

app.post("/admin/draft-documents/:id/finalize", asyncRoute(async (request, response) => {
  const documentRows = await query<Record<string, unknown>>("SELECT * FROM draft_documents WHERE id = ? LIMIT 1", [request.params.id]);
  const document = documentRows[0];
  if (!document || document.status !== "DRAFT") throw new HttpError(400, "This invoice is already finalized or unavailable.");
  if (document.kind !== "INVOICE") throw new HttpError(400, "Quotations do not update stock.");
  const items = await query<Record<string, unknown>>("SELECT * FROM draft_document_items WHERE document_id = ?", [request.params.id]);
  if (!items.length) throw new HttpError(400, "This invoice has no items.");

  const order = await transaction(async (connection) => {
    const productIds = [...new Set(items.map((item) => String(item.product_id)))];
    const products = await connection.query(`SELECT * FROM products WHERE is_active = TRUE AND id IN (${productIds.map(() => "?").join(",")})`, productIds) as ProductRow[];
    if (products.length !== productIds.length) throw new HttpError(400, "One or more selected products are unavailable.");
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of items) {
      const product = productMap.get(String(item.product_id));
      const stockNeeded = Number(item.stock_deducted ?? item.quantity);
      if (!product || Number(product.stock_quantity) < stockNeeded) throw new HttpError(400, `${item.product_name} has only ${product?.stock_quantity ?? 0} in stock. Edit the invoice quantity or update stock before finalizing.`);
    }

    const orderId = id("ord");
    const orderNumber = `SUN-${Date.now().toString().slice(-8)}`;
    await connection.query(
      `INSERT INTO orders
       (id, order_number, customer_name, customer_email, customer_phone, payment_method, payment_status, status, subtotal_cents, total_cents)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'CONFIRMED', ?, ?)`,
      [
        orderId,
        orderNumber,
        document.customer_name,
        document.customer_email ?? `invoice-${orderNumber.toLowerCase()}@sunsparkelectricals.co.ke`,
        document.customer_phone ?? null,
        document.payment_method,
        document.subtotal_cents,
        document.total_cents
      ]
    );

    for (const item of items) {
      const stockDeducted = Number(item.stock_deducted ?? Number(item.quantity));
      await connection.query(
        `INSERT INTO order_items
         (id, order_id, product_id, product_option_id, product_name, option_label, selling_unit, unit_cents, cost_cents, quantity, total_cents, stock_deducted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id("itm"), orderId, item.product_id, item.product_option_id ?? null, item.product_name,
          item.option_label ?? null, item.selling_unit ?? "UNIT", item.unit_cents, item.cost_cents, item.quantity, item.total_cents, stockDeducted
        ]
      );
      await connection.query("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?", [stockDeducted, item.product_id]);
    }

    await connection.query("INSERT INTO invoices (id, order_id, invoice_number) VALUES (?, ?, ?)", [id("inv"), orderId, `INV-${orderNumber}`]);
    await connection.query("UPDATE draft_documents SET status = 'COMPLETED', order_id = ? WHERE id = ?", [orderId, request.params.id]);
    return { id: orderId };
  });

  response.json(order);
}));

const authSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200)
});

app.post("/auth/login", asyncRoute(async (request, response) => {
  const input = authSchema.parse(request.body);
  const rows = await query<{ id: string; name: string; email: string; phone: string | null; role: string; password_hash: string; created_at: Date }>(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [input.email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw new HttpError(401, "Invalid email or password.");
  }
  response.json({ user: publicUser(user) });
}));

app.post("/auth/register", asyncRoute(async (request, response) => {
  const input = z.object({
    name: cleanText(120).min(2),
    email: z.string().email().transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(200)
  }).parse(request.body);

  const existing = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [input.email]);
  if (existing.length) throw new HttpError(409, "An account with that email already exists.");

  const userId = id("usr");
  await execute(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'CUSTOMER')",
    [userId, input.name, input.email, await bcrypt.hash(input.password, 12)]
  );
  const safeName = htmlEscape(input.name);

  sendEmail({
    to: input.email,
    subject: "Welcome to Sunspark Electrical and Solar",
    text: `Hello ${input.name}, welcome to Sunspark Electrical and Solar. You can now save your wishlist, place orders, and track your purchases at ${frontendOrigin()}.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
        <h2 style="margin:0 0 12px">Welcome to Sunspark Electrical and Solar</h2>
        <p>Hello ${safeName}, your account is ready.</p>
        <p>You can now save products, place orders, request invoices, and track purchases from your account.</p>
        <p><a href="${frontendOrigin()}/store" style="display:inline-block;background:#0f65c8;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Browse Sunspark products</a></p>
        <p>For help, reply to this email or WhatsApp ${env("SUPPORT_PHONE", "0703586562")}.</p>
      </div>
    `
  }).catch((error) => {
    console.error("Welcome email failed", error);
  });

  response.status(201).json({ user: { id: userId, name: input.name, email: input.email, phone: null, role: "CUSTOMER" } });
}));

app.get("/users/:id", asyncRoute(async (request, response) => {
  const rows = await query<{ id: string; name: string; email: string; phone: string | null; role: string; created_at: Date }>(
    "SELECT id, name, email, phone, role, created_at FROM users WHERE id = ? LIMIT 1",
    [request.params.id]
  );
  if (!rows[0]) throw new HttpError(404, "User not found.");
  response.json(publicUser(rows[0]));
}));

app.post("/auth/forgot-password", asyncRoute(async (request, response) => {
  const email = z.string().email().parse(request.body.email).toLowerCase();
  const rows = await query<{ id: string }>("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);

  if (rows[0]) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await execute(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
      [id("rst"), rows[0].id, hashToken(token), expires]
    );
    const resetUrl = `${frontendOrigin()}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: "Reset your Sunspark password",
      text: `Use this link to reset your Sunspark password. It expires in 1 hour: ${resetUrl}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
          <h2 style="margin:0 0 12px">Reset your Sunspark password</h2>
          <p>Use the button below to set a new password. This link expires in 1 hour.</p>
          <p><a href="${resetUrl}" style="display:inline-block;background:#0f65c8;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Reset password</a></p>
          <p>If you did not request this, you can safely ignore this email.</p>
        </div>
      `
    });
  }

  response.json({ ok: true });
}));

app.post("/auth/reset-password", asyncRoute(async (request, response) => {
  const input = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) }).parse(request.body);
  const rows = await query<{ id: string; user_id: string; role: string }>(
    `SELECT prt.id, prt.user_id, u.role
     FROM password_reset_tokens prt
     INNER JOIN users u ON u.id = prt.user_id
     WHERE prt.token_hash = ? AND prt.used_at IS NULL AND prt.expires_at > NOW()
     LIMIT 1`,
    [hashToken(input.token)]
  );
  if (!rows[0]) throw new HttpError(400, "Password reset link is invalid or expired.");

  await transaction(async (connection) => {
    await connection.query("UPDATE users SET password_hash = ? WHERE id = ?", [await bcrypt.hash(input.password, 12), rows[0].user_id]);
    await connection.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [rows[0].id]);
  });

  response.json({ ok: true, role: rows[0].role });
}));

app.post("/orders/checkout", asyncRoute(async (request, response) => {
  const input = z.object({
    userId: idInput.optional().nullable(),
    customerName: cleanText(140).min(2),
    customerEmail: z.string().email(),
    customerPhone: optionalText(40),
    deliveryNote: optionalText(900),
    deliveryLocation: optionalText(240),
    deliveryMapUrl: optionalUrl,
    deliveryLatitude: optionalText(40),
    deliveryLongitude: optionalText(40),
    paymentMethod: z.enum(["WHATSAPP", "MPESA", "CASH"]),
    items: z.array(z.object({ productId: idInput, productOptionId: idInput.optional().nullable(), quantity: z.number().int().positive().max(100000) })).min(1).max(100)
  }).parse(request.body);
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const rows = await query<ProductRow>(
    `SELECT * FROM products WHERE is_active = TRUE AND id IN (${productIds.map(() => "?").join(",")})`,
    productIds
  );
  const products = new Map(rows.map((row) => [row.id, row]));
  const optionMap = await optionsForProducts(productIds);

  const order = await transaction(async (connection) => {
    const orderId = id("ord");
    const orderNumber = `SUN-${Date.now().toString().slice(-8)}`;
    let subtotal = 0;
    const lines = input.items.map((item) => {
      const product = products.get(item.productId);
      if (!product) throw new HttpError(400, "One cart product is not available.");
      const options = optionMap.get(product.id) ?? [];
      const selectedOption =
        options.find((option) => option.id === item.productOptionId) ??
        options.find((option) => truthy(option.is_default)) ??
        options[0] ??
        null;
      const unitCents = selectedOption?.price_cents ?? product.price_cents;
      const costCents = selectedOption?.cost_cents ?? product.cost_cents;
      const sellingUnit = selectedOption?.selling_unit ?? product.selling_unit;
      const stockMultiplier = Number(selectedOption?.stock_multiplier ?? 1);
      const stockDeducted = stockMultiplier * item.quantity;
      if (Number(product.stock_quantity) < stockDeducted) throw new HttpError(400, `${product.name} has insufficient stock.`);
      const total = unitCents * item.quantity;
      subtotal += total;
      return { product, option: selectedOption, sellingUnit, unitCents, costCents, stockDeducted, quantity: item.quantity, total };
    });

    await connection.query(
      `INSERT INTO orders
       (id, order_number, user_id, customer_name, customer_email, customer_phone, delivery_note, delivery_location,
        delivery_map_url, delivery_latitude, delivery_longitude, payment_method, subtotal_cents, total_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        orderNumber,
        input.userId ?? null,
        input.customerName,
        input.customerEmail,
        input.customerPhone ?? null,
        input.deliveryNote ?? null,
        input.deliveryLocation ?? null,
        input.deliveryMapUrl ?? null,
        input.deliveryLatitude ?? null,
        input.deliveryLongitude ?? null,
        input.paymentMethod,
        subtotal,
        subtotal
      ]
    );

    for (const line of lines) {
      await connection.query(
        `INSERT INTO order_items
         (id, order_id, product_id, product_option_id, product_name, option_label, selling_unit, unit_cents, cost_cents, quantity, total_cents, stock_deducted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id("itm"), orderId, line.product.id, line.option?.id ?? null, line.product.name, line.option?.label ?? unitLabel(line.sellingUnit),
          line.sellingUnit, line.unitCents, line.costCents, line.quantity, line.total, line.stockDeducted
        ]
      );
      await connection.query("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?", [line.stockDeducted, line.product.id]);
    }

    const invoiceNumber = `INV-${orderNumber}`;
    await connection.query("INSERT INTO invoices (id, order_id, invoice_number) VALUES (?, ?, ?)", [id("inv"), orderId, invoiceNumber]);

    return {
      id: orderId,
      orderNumber,
      userId: input.userId ?? null,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? null,
      deliveryNote: input.deliveryNote ?? null,
      deliveryLocation: input.deliveryLocation ?? null,
      deliveryMapUrl: input.deliveryMapUrl ?? null,
      deliveryLatitude: input.deliveryLatitude ?? null,
      deliveryLongitude: input.deliveryLongitude ?? null,
      status: "PENDING",
      paymentMethod: input.paymentMethod,
      paymentStatus: "UNPAID",
      subtotalCents: subtotal,
      totalCents: subtotal,
      items: lines.map((line) => ({
        productId: line.product.id,
        productOptionId: line.option?.id ?? null,
        productName: line.product.name,
        optionLabel: line.option?.label ?? unitLabel(line.sellingUnit),
        sellingUnit: line.sellingUnit,
        unitCents: line.unitCents,
        costCents: line.costCents,
        quantity: line.quantity,
        totalCents: line.total,
        stockDeducted: line.stockDeducted
      })),
      invoice: { invoiceNumber }
    };
  });

  response.status(201).json(order);
}));

app.get("/orders", requireServiceToken, asyncRoute(async (request, response) => {
  const userId = String(request.query.userId ?? "");
  const email = String(request.query.email ?? "");
  const where: string[] = [];
  const values: unknown[] = [];

  if (userId) {
    where.push("user_id = ?");
    values.push(userId);
  }

  if (email) {
    where.push("(user_id IS NULL AND customer_email = ?)");
    values.push(email);
  }

  if (!where.length) {
    response.json([]);
    return;
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT
       id, order_number AS orderNumber, user_id AS userId, customer_name AS customerName,
       customer_email AS customerEmail, customer_phone AS customerPhone, delivery_note AS deliveryNote,
       delivery_location AS deliveryLocation, delivery_map_url AS deliveryMapUrl,
       delivery_latitude AS deliveryLatitude, delivery_longitude AS deliveryLongitude,
       status, payment_method AS paymentMethod, payment_status AS paymentStatus,
       subtotal_cents AS subtotalCents, total_cents AS totalCents, created_at AS createdAt, updated_at AS updatedAt
     FROM orders
     WHERE ${where.join(" OR ")}
     ORDER BY created_at DESC
     LIMIT 100`,
    values
  );
  response.json(rows);
}));

// Customer-facing single order lookup. The caller must prove which customer is
// asking, and ownership is enforced in SQL so a bug in the storefront cannot
// turn this into an "any order by id" endpoint.
app.get("/orders/:id", requireServiceToken, asyncRoute(async (request, response) => {
  const orderId = String(request.params.id ?? "");
  const userId = String(request.query.userId ?? "");
  const email = String(request.query.email ?? "");

  const ownership: string[] = [];
  const values: unknown[] = [orderId];

  if (userId) {
    ownership.push("user_id = ?");
    values.push(userId);
  }

  if (email) {
    ownership.push("(user_id IS NULL AND customer_email = ?)");
    values.push(email);
  }

  if (!ownership.length) {
    throw new HttpError(400, "An order owner is required.");
  }

  const orders = await query<Record<string, unknown>>(
    `SELECT
       id, order_number AS orderNumber, user_id AS userId, customer_name AS customerName,
       customer_email AS customerEmail, customer_phone AS customerPhone, delivery_note AS deliveryNote,
       delivery_location AS deliveryLocation, delivery_map_url AS deliveryMapUrl,
       delivery_latitude AS deliveryLatitude, delivery_longitude AS deliveryLongitude,
       status, payment_method AS paymentMethod, payment_status AS paymentStatus,
       subtotal_cents AS subtotalCents, total_cents AS totalCents, created_at AS createdAt, updated_at AS updatedAt
     FROM orders
     WHERE id = ? AND (${ownership.join(" OR ")})
     LIMIT 1`,
    values
  );

  if (!orders[0]) throw new HttpError(404, "Order not found.");

  const [items, invoices] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id, order_id AS orderId, product_id AS productId, product_option_id AS productOptionId,
       product_name AS productName, option_label AS optionLabel, selling_unit AS sellingUnit,
       unit_cents AS unitCents, cost_cents AS costCents, quantity, total_cents AS totalCents, stock_deducted AS stockDeducted
       FROM order_items WHERE order_id = ?`,
      [orderId]
    ),
    query<Record<string, unknown>>("SELECT id, order_id AS orderId, invoice_number AS invoiceNumber, issued_at AS issuedAt FROM invoices WHERE order_id = ? LIMIT 1", [orderId])
  ]);

  response.json({ ...orders[0], items, invoice: invoices[0] ?? null });
}));

app.get("/admin/orders", asyncRoute(async (request, response) => {
  const q = String(request.query.q ?? "").trim();
  const status = String(request.query.status ?? "");
  const paymentStatus = String(request.query.paymentStatus ?? "");
  const customerId = String(request.query.customerId ?? "");
  const where: string[] = [];
  const values: unknown[] = [];

  if (q) {
    where.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ? OR delivery_location LIKE ? OR delivery_note LIKE ?)");
    values.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push("status = ?");
    values.push(status);
  }
  if (paymentStatus) {
    where.push("payment_status = ?");
    values.push(paymentStatus);
  }
  if (customerId) {
    where.push("user_id = ?");
    values.push(customerId);
  }

  const orders = await query<Record<string, unknown>>(
    `SELECT
       id, order_number AS orderNumber, user_id AS userId, customer_name AS customerName,
       customer_email AS customerEmail, customer_phone AS customerPhone, delivery_note AS deliveryNote,
       delivery_location AS deliveryLocation, delivery_map_url AS deliveryMapUrl,
       delivery_latitude AS deliveryLatitude, delivery_longitude AS deliveryLongitude,
       status, payment_method AS paymentMethod, payment_status AS paymentStatus,
       subtotal_cents AS subtotalCents, total_cents AS totalCents, created_at AS createdAt, updated_at AS updatedAt
     FROM orders
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC
     LIMIT 200`,
    values
  );
  const ids = orders.map((order) => String(order.id));
  const items = ids.length
    ? await query<Record<string, unknown>>(
        `SELECT id, order_id AS orderId, product_id AS productId, product_option_id AS productOptionId,
         product_name AS productName, option_label AS optionLabel, selling_unit AS sellingUnit,
         unit_cents AS unitCents, cost_cents AS costCents, quantity, total_cents AS totalCents, stock_deducted AS stockDeducted
         FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")})`,
        ids
      )
    : [];
  response.json(orders.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id) })));
}));

app.get("/admin/orders/pending-count", asyncRoute(async (_request, response) => {
  const rows = await query<{ count: number }>("SELECT COUNT(*) AS count FROM orders WHERE status = 'PENDING'");
  response.json({ count: Number(rows[0]?.count ?? 0) });
}));

app.get("/admin/orders/:id", asyncRoute(async (request, response) => {
  const orders = await query<Record<string, unknown>>(
    `SELECT
       id, order_number AS orderNumber, user_id AS userId, customer_name AS customerName,
       customer_email AS customerEmail, customer_phone AS customerPhone, delivery_note AS deliveryNote,
       delivery_location AS deliveryLocation, delivery_map_url AS deliveryMapUrl,
       delivery_latitude AS deliveryLatitude, delivery_longitude AS deliveryLongitude,
       status, payment_method AS paymentMethod, payment_status AS paymentStatus,
       subtotal_cents AS subtotalCents, total_cents AS totalCents, created_at AS createdAt, updated_at AS updatedAt
     FROM orders WHERE id = ? LIMIT 1`,
    [request.params.id]
  );
  if (!orders[0]) throw new HttpError(404, "Order not found.");
  const [items, invoices] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id, order_id AS orderId, product_id AS productId, product_option_id AS productOptionId,
       product_name AS productName, option_label AS optionLabel, selling_unit AS sellingUnit,
       unit_cents AS unitCents, cost_cents AS costCents, quantity, total_cents AS totalCents, stock_deducted AS stockDeducted
       FROM order_items WHERE order_id = ?`,
      [request.params.id]
    ),
    query<Record<string, unknown>>("SELECT id, order_id AS orderId, invoice_number AS invoiceNumber, issued_at AS issuedAt FROM invoices WHERE order_id = ? LIMIT 1", [request.params.id])
  ]);
  response.json({ ...orders[0], items, invoice: invoices[0] ?? null });
}));

app.use(errorHandler);

const port = Number(env("PORT", "4000"));
app.listen(port, () => {
  console.log(`Sunspark API listening on ${port}`);
});

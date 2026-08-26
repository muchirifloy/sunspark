"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveBulkProductsAction, type BulkProductEdit } from "@/app/admin/products/bulk/actions";
import type { ActionResult } from "@/lib/actions/result";
import type { Category } from "@/lib/types";

export type EditableOption = {
  id: string;
  label: string;
  sellingUnit: string;
  priceCents: number;
  compareAtCents: number | null;
  costCents: number;
  stockMultiplier: number;
  isDefault: boolean;
};

export type EditableProduct = {
  id: string;
  name: string;
  categoryName: string;
  isActive: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  priceCents: number;
  compareAtCents: number | null;
  costCents: number;
  sellingUnit: string;
  options: EditableOption[];
};

type Filters = { q: string; category: string; status: string };

const leaveWarning = "This page has unsaved product changes. Leave them behind?";

/** Money is stored in cents; the grid types plain shillings. */
function amountValue(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "";
  return String(cents / 100);
}

function toCents(value: string) {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function toCount(value: string) {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric < 0 || !Number.isInteger(numeric)) return null;
  return numeric;
}

function toMultiplier(value: string) {
  const numeric = Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function productKey(productId: string, field: string) {
  return `${productId}::${field}`;
}

function optionKey(productId: string, optionId: string, field: string) {
  return `${productId}::opt::${optionId}::${field}`;
}

export function BulkProductEditor({ categories, filters, page, pageCount, perPage, products, total }: {
  categories: Category[];
  filters: Filters;
  page: number;
  pageCount: number;
  perPage: number;
  products: EditableProduct[];
  total: number;
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();
  const [isNavigating, startNavigating] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [query, setQuery] = useState(filters.q);
  const selectedCategories = useMemo(
    () => filters.category.split(",").map((slug) => slug.trim()).filter(Boolean),
    [filters.category]
  );
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirtyProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const key of Object.keys(edits)) ids.add(key.split("::")[0]);
    return ids;
  }, [edits]);
  const isDirty = dirtyProductIds.size > 0;

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  // A page of edits is minutes of typing; a stray reload should not eat it.
  useEffect(() => {
    if (!isDirty) return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function valueOf(key: string, original: string) {
    return edits[key] ?? original;
  }

  function setField(key: string, original: string, next: string) {
    setInvalidKeys((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : keys));
    setEdits((previous) => {
      const updated = { ...previous };
      if (next === original) delete updated[key];
      else updated[key] = next;
      return updated;
    });
  }

  function show(next: Partial<Filters> & { page?: number }) {
    if (isDirty && !window.confirm(leaveWarning)) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const params = new URLSearchParams();
    const nextQuery = (next.q ?? filters.q).trim();
    const nextCategory = next.category ?? filters.category;
    const nextStatus = next.status ?? filters.status;
    if (nextQuery) params.set("q", nextQuery);
    if (nextCategory) params.set("category", nextCategory);
    if (nextStatus) params.set("status", nextStatus);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    setEdits({});
    setInvalidKeys([]);
    setResult(null);
    startNavigating(() => router.replace(`/admin/products/bulk${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  function scheduleSearch(value: string) {
    setQuery(value);
    // While rows are dirty the confirm prompt would fire on every keystroke, so
    // the search waits for an explicit submit instead.
    if (isDirty) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => show({ q: value }), 250);
  }

  function toggleCategory(slug: string, checked: boolean) {
    const next = checked ? [...selectedCategories, slug] : selectedCategories.filter((item) => item !== slug);
    show({ category: next.join(",") });
  }

  function discard() {
    if (!window.confirm("Discard every unsaved change on this page?")) return;
    setEdits({});
    setInvalidKeys([]);
    setResult(null);
  }

  function buildPayload() {
    const payload: BulkProductEdit[] = [];
    const broken: string[] = [];

    for (const product of products) {
      if (!dirtyProductIds.has(product.id)) continue;

      const stockField = productKey(product.id, "stock");
      const lowField = productKey(product.id, "low");
      const stockQuantity = toCount(valueOf(stockField, String(product.stockQuantity)));
      const lowStockThreshold = toCount(valueOf(lowField, String(product.lowStockThreshold)));
      if (stockQuantity === null) broken.push(stockField);
      if (lowStockThreshold === null) broken.push(lowField);

      const options: BulkProductEdit["options"] = [];
      let fallbackPriceCents: number | undefined;
      let fallbackCompareCents: number | null | undefined;
      let fallbackCostCents: number | undefined;

      for (const option of optionRows(product)) {
        const priceField = optionKey(product.id, option.id, "price");
        const compareField = optionKey(product.id, option.id, "compare");
        const costField = optionKey(product.id, option.id, "cost");
        const multiplierField = optionKey(product.id, option.id, "multiplier");

        const priceCents = toCents(valueOf(priceField, amountValue(option.priceCents)));
        const rawCompare = valueOf(compareField, amountValue(option.compareAtCents)).trim();
        const compareAtCents = rawCompare ? toCents(rawCompare) : null;
        const costCents = toCents(valueOf(costField, amountValue(option.costCents)) || "0");
        const stockMultiplier = toMultiplier(valueOf(multiplierField, String(option.stockMultiplier)));

        if (priceCents === null) broken.push(priceField);
        if (rawCompare && compareAtCents === null) broken.push(compareField);
        if (costCents === null) broken.push(costField);
        if (stockMultiplier === null) broken.push(multiplierField);
        if (priceCents === null || costCents === null || stockMultiplier === null) continue;

        // A product with no saved options edits its own price columns instead.
        if (!product.options.length) {
          fallbackPriceCents = priceCents;
          fallbackCompareCents = compareAtCents;
          fallbackCostCents = costCents;
          continue;
        }

        options.push({ id: option.id, priceCents, compareAtCents, costCents, stockMultiplier });
      }

      if (stockQuantity === null || lowStockThreshold === null) continue;

      payload.push({
        id: product.id,
        stockQuantity,
        lowStockThreshold,
        priceCents: fallbackPriceCents,
        compareAtCents: fallbackCompareCents,
        costCents: fallbackCostCents,
        options
      });
    }

    return { payload, broken };
  }

  function save() {
    const { payload, broken } = buildPayload();
    setInvalidKeys(broken);

    if (broken.length) {
      setResult({ ok: false, message: "Nothing was saved. Fix the highlighted numbers first — prices, stock and stock x cannot be blank or negative." });
      return;
    }

    if (!payload.length) {
      setResult({ ok: false, message: "Nothing has changed yet." });
      return;
    }

    startSaving(async () => {
      const nextResult = await saveBulkProductsAction(payload);
      setResult(nextResult);
      if (nextResult.ok) {
        setEdits({});
        setInvalidKeys([]);
        router.refresh();
      }
    });
  }

  const firstRow = total ? (page - 1) * perPage + 1 : 0;
  const lastRow = Math.min(page * perPage, total);

  return (
    <div className="bulk-editor" aria-busy={isSaving || isNavigating}>
      <form
        className="admin-filter bulk-editor-filter"
        onSubmit={(event) => {
          event.preventDefault();
          show({ q: query });
        }}
      >
        <input
          aria-label="Search products"
          onChange={(event) => scheduleSearch(event.target.value)}
          placeholder="Search product, brand, category..."
          type="search"
          value={query}
        />
        <select aria-label="Filter by status" onChange={(event) => show({ status: event.target.value })} value={filters.status}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="low">Low stock</option>
        </select>
        <button disabled={isNavigating} type="submit">{isNavigating ? "Updating..." : "Search"}</button>
        <Link
          className="filter-reset"
          href="/admin/products/bulk"
          onClick={(event) => {
            if (isDirty && !window.confirm(leaveWarning)) event.preventDefault();
          }}
        >
          All products
        </Link>
      </form>

      <details className="bulk-category-filter">
        <summary>
          Categories
          <span>{selectedCategories.length ? `${selectedCategories.length} selected` : "All categories"}</span>
        </summary>
        <div className="bulk-category-list">
          {categories.length ? categories.map((category) => (
            <label className="check-label" key={category.id}>
              <input
                checked={selectedCategories.includes(category.slug)}
                onChange={(event) => toggleCategory(category.slug, event.target.checked)}
                type="checkbox"
              />
              <span>{category.name}</span>
            </label>
          )) : <p className="empty-state">No categories are available.</p>}
        </div>
      </details>

      {result ? (
        <p className={`admin-feedback ${result.ok ? "success" : "error"}`} role={result.ok ? "status" : "alert"}>{result.message}</p>
      ) : null}

      <div className="bulk-editor-summary">
        <span>{total ? `Showing ${firstRow}-${lastRow} of ${total} products` : "No products match this search."}</span>
        <span className={isDirty ? "bulk-dirty-count" : "bulk-dirty-count clean"}>
          {isDirty ? `${dirtyProductIds.size} product${dirtyProductIds.size === 1 ? "" : "s"} edited` : "No unsaved changes"}
        </span>
      </div>

      <div className="admin-table bulk-editor-table">
        <div className="bulk-editor-grid bulk-editor-head" role="row">
          <span>Product</span>
          <span>Selling option</span>
          <span>Sell (KSh)</span>
          <span>Compare (KSh)</span>
          <span>Buying (KSh)</span>
          <span>Stock x</span>
          <span>Stock</span>
          <span>Low alert</span>
        </div>

        {products.map((product) => {
          const stockField = productKey(product.id, "stock");
          const lowField = productKey(product.id, "low");
          const rows = optionRows(product);

          return (
            <div className={dirtyProductIds.has(product.id) ? "bulk-product-group dirty" : "bulk-product-group"} key={product.id}>
              {rows.map((option, index) => {
                const priceField = optionKey(product.id, option.id, "price");
                const compareField = optionKey(product.id, option.id, "compare");
                const costField = optionKey(product.id, option.id, "cost");
                const multiplierField = optionKey(product.id, option.id, "multiplier");
                // The fallback row edits the product's own price columns, and
                // those have no multiplier to consume stock against.
                const hasStoredOption = product.options.length > 0;

                return (
                  <div className="bulk-editor-grid bulk-editor-row" role="row" key={option.id}>
                    <span className="bulk-product-cell">
                      {index === 0 ? (
                        <>
                          <Link href={`/admin/products/${product.id}/edit`}>{product.name}</Link>
                          <small>{product.categoryName}{product.isActive ? "" : " · Hidden"}</small>
                        </>
                      ) : null}
                    </span>
                    <span className="bulk-option-cell">
                      {option.label}
                      {option.isDefault && rows.length > 1 ? <em>Default</em> : null}
                    </span>
                    <input
                      aria-label={`Selling price for ${product.name}, ${option.label}`}
                      className={invalidKeys.includes(priceField) ? "invalid" : ""}
                      min="0"
                      onChange={(event) => setField(priceField, amountValue(option.priceCents), event.target.value)}
                      step="0.01"
                      type="number"
                      value={valueOf(priceField, amountValue(option.priceCents))}
                    />
                    <input
                      aria-label={`Compare price for ${product.name}, ${option.label}`}
                      className={invalidKeys.includes(compareField) ? "invalid" : ""}
                      min="0"
                      onChange={(event) => setField(compareField, amountValue(option.compareAtCents), event.target.value)}
                      placeholder="None"
                      step="0.01"
                      type="number"
                      value={valueOf(compareField, amountValue(option.compareAtCents))}
                    />
                    <input
                      aria-label={`Buying price for ${product.name}, ${option.label}`}
                      className={invalidKeys.includes(costField) ? "invalid" : ""}
                      min="0"
                      onChange={(event) => setField(costField, amountValue(option.costCents), event.target.value)}
                      step="0.01"
                      type="number"
                      value={valueOf(costField, amountValue(option.costCents))}
                    />
                    <input
                      aria-label={`Stock multiplier for ${product.name}, ${option.label}`}
                      className={invalidKeys.includes(multiplierField) ? "invalid" : ""}
                      disabled={!hasStoredOption}
                      min="0.01"
                      onChange={(event) => setField(multiplierField, String(option.stockMultiplier), event.target.value)}
                      step="0.01"
                      type="number"
                      value={valueOf(multiplierField, String(option.stockMultiplier))}
                    />
                    <span className="bulk-stock-cell">
                      {index === 0 ? (
                        <input
                          aria-label={`Stock for ${product.name}`}
                          className={invalidKeys.includes(stockField) ? "invalid" : ""}
                          min="0"
                          onChange={(event) => setField(stockField, String(product.stockQuantity), event.target.value)}
                          step="1"
                          type="number"
                          value={valueOf(stockField, String(product.stockQuantity))}
                        />
                      ) : null}
                    </span>
                    <span className="bulk-stock-cell">
                      {index === 0 ? (
                        <input
                          aria-label={`Low stock alert for ${product.name}`}
                          className={invalidKeys.includes(lowField) ? "invalid" : ""}
                          min="0"
                          onChange={(event) => setField(lowField, String(product.lowStockThreshold), event.target.value)}
                          step="1"
                          type="number"
                          value={valueOf(lowField, String(product.lowStockThreshold))}
                        />
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {!products.length ? <p className="empty-state">No products match this search.</p> : null}
      </div>

      {pageCount > 1 ? (
        <nav className="pagination bulk-editor-pagination" aria-label="Bulk edit pages">
          <button disabled={page <= 1} onClick={() => show({ page: page - 1 })} type="button">Previous</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
            <button className={item === page ? "active" : ""} key={item} onClick={() => show({ page: item })} type="button">{item}</button>
          ))}
          <button disabled={page >= pageCount} onClick={() => show({ page: page + 1 })} type="button">Next</button>
        </nav>
      ) : null}

      <div className="bulk-editor-savebar">
        <span>
          {isDirty
            ? `${dirtyProductIds.size} product${dirtyProductIds.size === 1 ? "" : "s"} waiting to save. Edits are not carried across pages.`
            : "Edit any cell above, then save once."}
        </span>
        <div>
          <button className="secondary-btn" disabled={!isDirty || isSaving} onClick={discard} type="button">Discard changes</button>
          <button aria-busy={isSaving} className="primary-btn" disabled={!isDirty || isSaving} onClick={save} type="button">
            {isSaving ? "Saving..." : isDirty ? `Save ${dirtyProductIds.size} change${dirtyProductIds.size === 1 ? "" : "s"}` : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Every product should carry at least one selling option, but older rows
 * predate them, so the grid falls back to the product's own price columns
 * rather than rendering a product with nothing to edit.
 */
function optionRows(product: EditableProduct): EditableOption[] {
  if (product.options.length) return product.options;
  return [{
    id: `product:${product.id}`,
    label: product.sellingUnit || "Unit",
    sellingUnit: product.sellingUnit,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
    costCents: product.costCents,
    stockMultiplier: 1,
    isDefault: true
  }];
}

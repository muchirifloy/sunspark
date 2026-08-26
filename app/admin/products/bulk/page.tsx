import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { BulkProductEditor } from "@/components/admin/bulk-product-editor";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch, toQueryString } from "@/lib/api/client";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const perPage = 100;

type AdminProductsResponse = {
  products: Product[];
  total: number;
  page: number;
  perPage: number;
  unavailable?: boolean;
};

type BulkSearchParams = { q?: string; category?: string; status?: string; page?: string };

export default async function AdminProductsBulkPage({
  searchParams
}: {
  searchParams?: Promise<BulkSearchParams>;
}) {
  await requireOwnerAdmin();
  const params = await searchParams;
  const requestedPage = Math.max(Number(params?.page ?? 1) || 1, 1);
  const categories = await getCategories();

  return (
    <AdminLayout
      title="Bulk edit"
      subtitle="Edit selling price, compare price, buying price, stock and stock x across the catalogue, then save once."
      actions={<Link className="secondary-btn" href="/admin/products">Back to products</Link>}
    >
      <AdminSectionErrorBoundary message="The bulk editor could not load its products. This is a connection problem, not an empty catalogue. Reload to try again.">
        <Suspense
          fallback={<BulkSkeleton />}
          key={`${params?.q ?? ""}-${params?.category ?? ""}-${params?.status ?? ""}-${requestedPage}`}
        >
          <BulkGrid categories={categories} params={params} requestedPage={requestedPage} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

async function BulkGrid({ categories, params, requestedPage }: {
  categories: Category[];
  params?: BulkSearchParams;
  requestedPage: number;
}) {
  const result = await getProducts({
    q: params?.q,
    category: params?.category,
    status: params?.status,
    page: requestedPage,
    perPage
  });
  const pageCount = Math.max(Math.ceil(result.total / perPage), 1);
  const page = Math.min(result.page, pageCount);

  return (
    <>
      {result.unavailable ? (
        <p className="admin-feedback error" role="alert">
          Product records could not load from the backend right now. Retry in a moment before editing.
        </p>
      ) : null}
      <BulkProductEditor
        categories={categories}
        filters={{ q: params?.q ?? "", category: params?.category ?? "", status: params?.status ?? "" }}
        page={page}
        pageCount={pageCount}
        perPage={perPage}
        products={result.products.map(toEditableProduct)}
        total={result.total}
      />
    </>
  );
}

/**
 * The grid only ever renders names, stock and per-option numbers, so the
 * description HTML, SEO columns, image rows and nested category of 100 products
 * are dropped here rather than shipped into the client bundle.
 */
function toEditableProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    categoryName: product.category?.name ?? "",
    isActive: product.isActive,
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
    costCents: product.costCents,
    sellingUnit: product.sellingUnit,
    options: (product.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      sellingUnit: option.sellingUnit,
      priceCents: option.priceCents,
      compareAtCents: option.compareAtCents,
      costCents: option.costCents,
      stockMultiplier: option.stockMultiplier,
      isDefault: option.isDefault
    }))
  };
}

function BulkSkeleton() {
  return (
    <div className="bulk-editor-table" aria-busy="true">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <div className="bulk-editor-grid admin-row-skeleton" key={row}>
          <span /><span /><span /><span /><span /><span /><span />
        </div>
      ))}
    </div>
  );
}

async function getProducts(input: { q?: string; category?: string; status?: string; page: number; perPage: number }): Promise<AdminProductsResponse> {
  const terms = input.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  try {
    return await apiFetch<AdminProductsResponse>(`/admin/products${toQueryString({
      q: terms.join(" "),
      category: input.category,
      status: input.status,
      page: input.page,
      perPage: input.perPage
    })}`);
  } catch {
    return { products: [], total: 0, page: input.page, perPage: input.perPage, unavailable: true };
  }
}

async function getCategories() {
  try {
    return await apiFetch<Category[]>("/admin/categories");
  } catch {
    return [];
  }
}

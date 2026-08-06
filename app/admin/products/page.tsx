import Image from "next/image";
import Link from "next/link";
import { AdminLayout } from "@/components/admin/admin-layout";
import { requireAdmin } from "@/lib/auth/guards";
import { canManageCatalog } from "@/lib/auth/roles";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { productUrl } from "@/lib/merchant/feed";
import { formatMoney } from "@/lib/money";
import { deleteProductAction, hideProductAction } from "./actions";
import { getPrimaryImage, publicImageUrl } from "@/lib/products/images";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  deleted: "Product deleted.",
  hidden: "Product hidden from the storefront.",
  delete: "The product could not be deleted. Please try again.",
  "delete-linked": "This product is used on an invoice or quotation. Hide it instead, or remove it from those documents first."
};

type AdminProductsResponse = {
  products: Product[];
  total: number;
  page: number;
  perPage: number;
  unavailable?: boolean;
};

export default async function AdminProductsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; category?: string; status?: string; page?: string; error?: string; notice?: string }>;
}) {
  const admin = await requireAdmin();
  const canEditProducts = canManageCatalog(admin.role);
  const params = await searchParams;
  const perPage = 25;
  const requestedPage = Math.max(Number(params?.page ?? 1) || 1, 1);
  const productResult = await getProducts({
    category: params?.category,
    q: params?.q,
    status: params?.status,
    page: requestedPage,
    perPage
  });
  const products = productResult.products;
  const pageCount = Math.max(Math.ceil(productResult.total / perPage), 1);
  const page = Math.min(productResult.page, pageCount);
  const categories = await getCategories();
  const feedback = params?.error ? messages[params.error] : params?.notice ? messages[params.notice] : null;

  return (
    <AdminLayout
      title="Products"
      subtitle="Manage product pricing, stock, status, and images."
      actions={
        canEditProducts ? (
        <Link className="primary-btn" href="/admin/products/new">
          Add product
        </Link>
        ) : null
      }
    >
        {feedback ? <p className={params?.error ? "admin-feedback error" : "admin-feedback success"} role="status">{feedback}</p> : null}
        {productResult.unavailable ? (
          <p className="admin-feedback error" role="alert">
            Product records could not load from the backend right now. Filters and actions are still available; retry the list in a moment.
          </p>
        ) : null}
        <form action="/admin/products" className="admin-filter">
          <input name="q" defaultValue={params?.q ?? ""} placeholder="Search product, brand, description..." />
          <select name="category" defaultValue={params?.category ?? ""}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option value={category.slug} key={category.id}>{category.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={params?.status ?? ""}>
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
            <option value="low">Low stock</option>
          </select>
          <button type="submit">Filter</button>
          <Link className="filter-reset" href="/admin/products">All products</Link>
        </form>
        <div className="admin-table product-admin-table">
          <div className="admin-table-row heading">
            <span>Product</span>
            <span>Category</span>
            <span>Price</span>
            <span>Stock</span>
            <span>Status</span>
            <span></span>
          </div>
          {products.map((product) => {
            const thumbnail = getPrimaryImage(product.images);
            const productHref = canEditProducts
              ? `/admin/products/${product.id}/edit`
              : `/product/${product.slug}`;

            return (
              <div className="admin-table-row" key={product.id}>
                <Link className="admin-product-link" href={productHref}>
                  <span className="admin-product-thumbnail">
                    {thumbnail ? (
                      <Image
                        alt=""
                        height={44}
                        sizes="44px"
                        src={publicImageUrl(thumbnail.url)}
                        width={44}
                      />
                    ) : (
                      <span aria-hidden="true">—</span>
                    )}
                  </span>
                  <strong>{product.name}</strong>
                </Link>
                <span>{product.category.name}</span>
                <span>{formatMoney(product.priceCents)}</span>
              <span className={`stock-pill ${product.stockQuantity <= 0 ? "out" : product.stockQuantity <= product.lowStockThreshold ? "low" : "healthy"}`}>
                {product.stockQuantity <= 0
                  ? "Out of stock"
                  : product.stockQuantity <= product.lowStockThreshold
                    ? `${product.stockQuantity} · Low`
                    : `${product.stockQuantity} · In stock`}
              </span>
                <span className={product.isActive ? "status-pill active" : "status-pill"}>{product.isActive ? "Active" : "Hidden"}</span>
                <details className="row-action-menu">
                  <summary>Actions</summary>
                  <div>
                    <a href={productUrl(product.slug)} rel="noreferrer" target="_blank">Merchant link</a>
                    {canEditProducts ? <Link href={`/admin/products/${product.id}/edit`}>Edit product</Link> : null}
                    {canEditProducts && product.isActive ? (
                      <form action={hideProductAction.bind(null, product.id)}>
                        <button type="submit" title="Hide from customers without deleting order history">Hide product</button>
                      </form>
                    ) : null}
                    {canEditProducts ? <form action={deleteProductAction.bind(null, product.id)}>
                      <button className="danger-btn" type="submit">Delete product</button>
                    </form> : null}
                  </div>
                </details>
              </div>
            );
          })}
          {!productResult.total && !productResult.unavailable ? <p className="empty-state">No products match this search.</p> : null}
        </div>
        {productResult.total > perPage ? (
          <nav className="pagination" aria-label="Product pages">
            <Link className={page <= 1 ? "disabled" : ""} href={productPageHref(params, page - 1)}>Previous</Link>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
              <Link className={item === page ? "active" : ""} href={productPageHref(params, item)} key={item}>{item}</Link>
            ))}
            <Link className={page >= pageCount ? "disabled" : ""} href={productPageHref(params, page + 1)}>Next</Link>
          </nav>
        ) : null}
    </AdminLayout>
  );
}

function productPageHref(
  params: { q?: string; category?: string; status?: string } | undefined,
  page: number
) {
  return `/admin/products${toQueryString({
    q: params?.q,
    category: params?.category,
    status: params?.status,
    page: Math.max(page, 1)
  })}`;
}

async function getProducts(input: { q?: string; category?: string; status?: string; page: number; perPage: number }): Promise<AdminProductsResponse> {
  const terms = input.q?.trim().split(/\s+/).filter(Boolean) ?? [];
  try {
    return apiFetch<AdminProductsResponse>(`/admin/products${toQueryString({
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
    return apiFetch<Category[]>("/admin/categories");
  } catch {
    return [];
  }
}

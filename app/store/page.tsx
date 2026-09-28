import { ProductGridInfinite } from "@/components/site/product-grid-infinite";
import { loadMoreProducts } from "@/lib/products/actions";
import { PRODUCTS_PAGE_SIZE, getStoreCategories, getStoreProducts } from "@/lib/products/queries";
import { siteConfig } from "@/lib/site-config";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store",
  description: "Shop electricals, electronics, cables, breakers, switches, sockets and solar accessories from Sunspark in Nairobi CBD.",
  alternates: {
    canonical: `${siteConfig.url}/store`
  }
};

export default async function StorePage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const [products, categories] = await Promise.all([
    getStoreProducts({ q: params?.q, category: params?.category, limit: PRODUCTS_PAGE_SIZE }),
    getStoreCategories()
  ]);

  return (
    <section className="section">
      <div className="container store-layout">
        <aside className="store-aside">
          <h1>Store</h1>
          <p>Electricals, electronics, and solar products priced in KSH.</p>
          <form className="stack-form" action="/store">
            <label>
              Search
              <input name="q" defaultValue={params?.q ?? ""} placeholder="Cable, inverter, breaker..." />
            </label>
            <label>
              Category
              <select name="category" defaultValue={params?.category ?? ""}>
                <option value="">All</option>
                {categories.map((category) => (
                  <option value={category.slug} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-btn" type="submit">
              Filter
            </button>
          </form>
        </aside>
        <div>
          <div className="store-toolbar">
            <strong>Products</strong>
            <span>Search by name, brand, or description to narrow the catalogue.</span>
          </div>
          {products.length ? (
            <ProductGridInfinite
              initialProducts={products}
              loadMore={loadMoreProducts}
              pageSize={PRODUCTS_PAGE_SIZE}
              query={{ q: params?.q, category: params?.category }}
            />
          ) : (
            <div className="empty-state">
              <h2>No matching products</h2>
              <p>Try a broader search, choose another category, or contact Sunspark for current stock and pricing.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

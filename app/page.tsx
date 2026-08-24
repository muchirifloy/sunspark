import Link from "next/link";
import { CategoryTile } from "@/components/site/category-tile";
import { CampaignFeature } from "@/components/site/campaign-feature";
import { ProductCard } from "@/components/site/product-card";
import { formatMoney } from "@/lib/money";
import { getHomeData } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

function chunkProducts<T>(products: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < products.length; index += size) {
    rows.push(products.slice(index, index + size));
  }
  return rows;
}

export default async function HomePage() {
  const { campaigns, categories: displayCategories, categorySections, products, brands } = await getHomeData();
  const productSections = categorySections.filter((category) => category.products.length);
  const topProducts = products.slice(0, 4);

  return (
    <>
      {/* The design opens straight into the category grid, so the page heading
          is present for the document outline without altering the layout. */}
      <h1 className="visually-hidden">Sunspark Electrical and Solar - electricals, electronics, and solar products in Nairobi</h1>
      <section className="section category-section">
        <div className="container storefront-showcase">
          <div className="category-grid shop-grid">
            {displayCategories.map((category) => (
              <CategoryTile category={category} key={category.slug} />
            ))}
          </div>
          {topProducts.length ? (
            <div className="mini-product-panel">
              <div className="mini-panel-heading"><strong>Best sellers</strong><Link href="/store">Shop all</Link></div>
              {topProducts.map((product) => <Link href={`/product/${product.slug}`} key={product.id}><span>{product.name}</span><strong>{formatMoney(product.priceCents)}</strong></Link>)}
            </div>
          ) : null}
          <CampaignFeature campaign={campaigns[0]} />
        </div>
      </section>
      {brands.length ? <section className="section brand-section"><div className="container"><details className="brand-disclosure"><summary><span>Shop by Brand</span><Link href="/store">View all</Link></summary><div className="brand-list">{brands.map((brand) => <Link href={`/store?q=${encodeURIComponent(brand)}`} key={brand}>{brand}</Link>)}</div></details></div></section> : null}
      {productSections.map((category) => (
          <section className="section product-section" key={category.id}>
            <div className="container">
              <div className="section-title">
                <h2>{category.name} Products</h2>
                <Link href={`/category/${category.slug}`}>View all</Link>
              </div>
              {chunkProducts(category.products, 12).map((row, index) => (
                <div className="product-slider product-slider-row" aria-label={`${category.name} products row ${index + 1}`} key={index}>
                  {row.map((product) => (
                    <ProductCard product={product} key={product.id} />
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      {!productSections.length ? (
        <section className="section product-section">
          <div className="container">
            <div className="section-title">
              <h2>Shop Sunspark Products</h2>
              <div className="section-tabs">
                {displayCategories.map((category) => (
                  <Link href={`/category/${category.slug}`} key={category.slug}>
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
            {products.length ? (
              <div className="product-slider" aria-label="Featured products">
                {products.map((product) => (
                  <ProductCard product={product} key={product.id} />
                ))}
              </div>
            ) : (
              <div className="empty-products">
                <h2>Shop electrical supplies in Nairobi</h2>
                <p>Search cables, breakers, switches, sockets, lighting, electronics, and installation materials from Sunspark.</p>
                <Link className="primary-btn" href="/store">Browse store</Link>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}

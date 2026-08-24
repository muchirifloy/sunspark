import Link from "next/link";
import { ProductCard } from "@/components/site/product-card";
import { preventAdminShopping } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { getWishlistSlugs } from "@/lib/wishlist/wishlist-service";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  await preventAdminShopping();
  const slugs = await getWishlistSlugs();
  const products = await getProducts(slugs);

  return (
    <section className="section">
      <div className="container">
        <div className="section-title">
          <h1>Wishlist</h1>
        </div>
        {products.length ? (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard product={product} key={product.id} />
            ))}
          </div>
        ) : (
          <div className="empty-products">
            <h2>No wishlist items</h2>
            <Link className="primary-btn" href="/store">
              Continue shopping
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

async function getProducts(slugs: string[]) {
  if (!slugs.length) {
    return [];
  }

  try {
    return apiFetch<Product[]>(`/products/by-slugs?slugs=${encodeURIComponent(slugs.join(","))}`);
  } catch {
    return [];
  }
}

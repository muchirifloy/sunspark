"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ProductCard } from "@/components/site/product-card";
import type { Product } from "@/lib/types";

type ProductQuery = { q?: string; category?: string };

export function ProductGridInfinite({
  initialProducts,
  loadMore,
  pageSize,
  query
}: {
  initialProducts: Product[];
  loadMore: (input: { q?: string; category?: string; offset: number; limit: number }) => Promise<Product[]>;
  pageSize: number;
  query: ProductQuery;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [hasMore, setHasMore] = useState(initialProducts.length >= pageSize);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // A new search or category filter swaps in a fresh initial batch without
  // remounting this component, so state has to reset in step with it.
  useEffect(() => {
    setProducts(initialProducts);
    setHasMore(initialProducts.length >= pageSize);
  }, [initialProducts, pageSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || isPending) return;
        startTransition(async () => {
          const next = await loadMore({ ...query, offset: products.length, limit: pageSize });
          if (next.length) setProducts((current) => [...current, ...next]);
          if (next.length < pageSize) setHasMore(false);
        });
      },
      { rootMargin: "800px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isPending, loadMore, pageSize, products.length, query]);

  return (
    <>
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard product={product} key={product.id} />
        ))}
      </div>
      {hasMore ? (
        <div className="product-grid-sentinel" ref={sentinelRef}>
          {isPending ? <span className="product-grid-loading">Loading more products...</span> : null}
        </div>
      ) : null}
    </>
  );
}

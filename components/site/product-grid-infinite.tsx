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
  // A ref (not the isPending state) guards against a duplicate fetch, because the
  // IntersectionObserver callback below closes over whatever this function looked
  // like when the effect last ran - isPending there could read stale while a
  // request is in flight and let a second one through for the same offset.
  const isLoadingRef = useRef(false);

  // A new search or category filter swaps in a fresh initial batch without
  // remounting this component, so state has to reset in step with it.
  useEffect(() => {
    setProducts(initialProducts);
    setHasMore(initialProducts.length >= pageSize);
  }, [initialProducts, pageSize]);

  function loadNextPage() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    startTransition(async () => {
      try {
        const next = await loadMore({ ...query, offset: products.length, limit: pageSize });
        if (next.length) setProducts((current) => [...current, ...next]);
        if (next.length < pageSize) setHasMore(false);
      } finally {
        isLoadingRef.current = false;
      }
    });
  }

  // Auto-loads once the sentinel nears the viewport. The button below is not
  // just a fallback for when this misses (slow/instant scrolls, reduced-motion
  // setups) - it also gives an obvious, clickable way to get more without
  // relying on scroll position at all.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadNextPage();
      },
      { rootMargin: "800px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadMore, pageSize, products.length, query]);

  return (
    <>
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard product={product} key={product.id} />
        ))}
      </div>
      {hasMore ? (
        <div className="product-grid-sentinel" ref={sentinelRef}>
          {isPending ? (
            <span className="product-grid-loading">Loading more products...</span>
          ) : (
            <button className="secondary-btn" onClick={loadNextPage} type="button">
              See more products
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

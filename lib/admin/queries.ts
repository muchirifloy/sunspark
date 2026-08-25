import "server-only";

import { cache } from "react";
import { apiFetch, type ApiFetchInit } from "@/lib/api/client";
import { catalogRevalidateSeconds, catalogTag, ordersRevalidateSeconds, ordersTag } from "@/lib/cache-tags";
import type { SaleProduct } from "@/lib/types";

/**
 * Admin reads used to go straight through apiFetch, which defaults to
 * `cache: "no-store"`, so every click paid a full round trip to the backend even
 * though the catalogue is identical for every admin and changes only when
 * someone edits it. The storefront already solved this in lib/products/queries.ts
 * by tagging its reads; this is the same treatment for the back office.
 *
 * `force-dynamic` on the admin pages does not defeat this. Next only falls back
 * to no-store when a fetch supplies no cache config of its own -- an explicit
 * `revalidate` is still honoured (see the `noFetchConfigAndForceDynamic` check
 * in next/dist/server/lib/patch-fetch.js).
 *
 * Reliability here comes from the cache, not from the request. Once the
 * catalogue has been read once it is served from the Data Cache, and a backend
 * that is briefly slow or down is invisible: the cached copy is served while
 * revalidation happens behind the request, and a failed revalidation keeps the
 * existing entry rather than discarding it.
 *
 * The retry is kept for the only case that actually reaches the network -- a
 * cold cache -- but the per-attempt timeout is cut from the shared 12s so the
 * total budget is roughly 10s rather than the 24.6s that 12s + 600ms + 12s
 * produced. An operator waiting 25s on a blank screen is its own outage.
 */
const catalogInit: ApiFetchInit = {
  next: { revalidate: catalogRevalidateSeconds, tags: [catalogTag] },
  retries: 1,
  timeoutMs: 5000
};

/**
 * Backs the product picker on walk-in sale, invoice and quotation forms.
 *
 * `inStockOnly` mirrors the behaviour each page had before this was shared:
 * walk-in sales deduct stock immediately so they only ever offered in-stock
 * products, while invoices and quotations could reference the whole catalogue.
 *
 * This intentionally does NOT swallow failures. With the cache in front of it
 * the error path should effectively never be reached -- it only fires on a cold
 * cache with the backend genuinely unreachable. When that does happen, an empty
 * picker is indistinguishable from "this shop has no products", which invites an
 * operator to conclude a real item does not exist and re-key it by hand at the
 * wrong price. Callers put an error boundary around the picker so the failure is
 * stated plainly and the rest of the page keeps working.
 */
export const getSaleProducts = cache(async (inStockOnly = false): Promise<SaleProduct[]> => {
  const path = `/admin/sale-products${inStockOnly ? "?inStock=1" : ""}`;
  return apiFetch<SaleProduct[]>(path, catalogInit);
});

/**
 * The sidebar badge, so this runs on every single admin page load. Uncached it
 * added a full backend round trip to every click for a number that only has to
 * be roughly current. Order mutations clear the tag, so the badge still updates
 * immediately after a sale rather than waiting out the window.
 *
 * The fallback stays: a badge is decoration. Failing the whole dashboard shell
 * because a count did not load would be the wrong trade, and unlike an empty
 * table a missing badge cannot be mistaken for meaningful data.
 */
export const getPendingOrderCount = cache(async (): Promise<number> => {
  try {
    const result = await apiFetch<{ count: number }>("/admin/orders/pending-count", {
      next: { revalidate: ordersRevalidateSeconds, tags: [ordersTag] },
      retries: 0,
      timeoutMs: 3000
    });
    return Math.max(Number(result.count) || 0, 0);
  } catch {
    return 0;
  }
});

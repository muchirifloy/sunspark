"use server";

import { getStoreProducts } from "@/lib/products/queries";

export async function loadMoreProducts(input: { q?: string; category?: string; offset: number; limit: number }) {
  return getStoreProducts(input);
}

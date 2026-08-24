import { cache } from "react";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { catalogRevalidateSeconds, catalogTag } from "@/lib/cache-tags";
import type { Campaign, Category, Product } from "@/lib/types";

const queryTimeoutMs = 9000;

// Catalog reads are identical for every visitor, so they are cached across
// requests and cleared by tag whenever an admin changes the catalogue.
const catalogInit: RequestInit = {
  next: { revalidate: catalogRevalidateSeconds, tags: [catalogTag] }
};

function storefrontCategoryRank(slug: string) {
  const order = ["electricals", "electronics", "solar"];
  const rank = order.indexOf(slug);
  return rank === -1 ? order.length : rank;
}

async function withFallback<T>(query: Promise<T>, fallback: T): Promise<T> {
  // The timer has to be cleared on the winning path, otherwise every call keeps
  // a pending timeout alive for its full duration.
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      query,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), queryTimeoutMs);
      })
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The root layout renders the campaign modal on every page and the homepage
// needs the same list, so this is shared rather than fetched twice.
export const getCampaigns = cache(async () => {
  return withFallback(apiFetch<Campaign[]>("/campaigns", catalogInit), []);
});

export const getHomeData = cache(async () => {
  const [data, campaigns] = await Promise.all([
    withFallback(
      apiFetch<{ categories: Category[]; categorySections: Category[]; products: Product[]; brands: string[] }>("/home", catalogInit),
      null
    ),
    getCampaigns()
  ]);

  if (data?.categories.length || data?.categorySections.length || data?.products.length) {
    const products = data.products.length
      ? data.products
      : data.categorySections.flatMap((category) => category.products).slice(0, 24);

    return {
      campaigns,
      categories: data.categories.sort((a, b) => storefrontCategoryRank(a.slug) - storefrontCategoryRank(b.slug)),
      products,
      categorySections: data.categorySections.sort((a, b) => storefrontCategoryRank(a.slug) - storefrontCategoryRank(b.slug)),
      brands: data.brands
    };
  }

  const categories = await getStoreCategories();
  const categorySections = await Promise.all(
    categories.map(async (category) => ({
      ...category,
      products: await getStoreProducts({ category: category.slug, limit: 24 })
    }))
  );
  const products = categorySections.flatMap((category) => category.products).slice(0, 24);

  return {
    campaigns,
    categories,
    products,
    categorySections: categorySections.filter((category) => category.products.length),
    brands: []
  };
});

export const getStoreCategories = cache(async () => {
  const categories = await withFallback(apiFetch<Category[]>("/categories", catalogInit), []);
  return categories.sort((a, b) => storefrontCategoryRank(a.slug) - storefrontCategoryRank(b.slug));
});

export const getStoreProducts = cache(async (input: { q?: string; category?: string; limit?: number }) => {
  return withFallback(apiFetch<Product[]>(`/products${toQueryString({ q: input.q, category: input.category, limit: input.limit ?? 50 })}`, catalogInit), []);
});

export const getCategoryBySlug = cache(async (slug: string) => {
  return withFallback(apiFetch<Category>(`/categories/${encodeURIComponent(slug)}`, catalogInit), null);
});

export const getProductBySlug = cache(async (slug: string) => {
  return withFallback(apiFetch<Product>(`/products/${encodeURIComponent(slug)}`, catalogInit), null);
});

export const getProductBySlugStrict = cache(async (slug: string) => {
  try {
    return await apiFetch<Product>(`/products/${encodeURIComponent(slug)}`, catalogInit);
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status?: number }).status === 404) {
      return null;
    }
    throw error;
  }
});

export const getRelatedProducts = cache(async (_categoryId: string, productId: string) => {
  return withFallback(apiFetch<Product[]>(`/products/${encodeURIComponent(productId)}/related`, catalogInit), []);
});

export const getProductCompanions = cache(async (_categoryId: string, productId: string) => {
  return withFallback(apiFetch<Product[]>(`/products/${encodeURIComponent(productId)}/companions`, catalogInit), []);
});

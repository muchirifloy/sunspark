import { apiFetch, toQueryString } from "@/lib/api/client";
import type { Campaign, Category, Product } from "@/lib/types";

const queryTimeoutMs = 9000;

function storefrontCategoryRank(slug: string) {
  const order = ["electricals", "electronics", "solar"];
  const rank = order.indexOf(slug);
  return rank === -1 ? order.length : rank;
}

async function withFallback<T>(query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      query,
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback), queryTimeoutMs);
      })
    ]);
  } catch {
    return fallback;
  }
}

export async function getHomeData() {
  const [data, campaigns] = await Promise.all([
    withFallback(
    apiFetch<{ categories: Category[]; categorySections: Category[]; products: Product[]; brands: string[] }>("/home"),
      null
    ),
    withFallback(apiFetch<Campaign[]>("/campaigns"), [])
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
}

export async function getStoreCategories() {
  const categories = await withFallback(apiFetch<Category[]>("/categories"), []);
  return categories.sort((a, b) => storefrontCategoryRank(a.slug) - storefrontCategoryRank(b.slug));
}

export async function getStoreProducts(input: { q?: string; category?: string; limit?: number }) {
  return withFallback(apiFetch<Product[]>(`/products${toQueryString({ q: input.q, category: input.category, limit: input.limit ?? 50 })}`), []);
}

export async function getCategoryBySlug(slug: string) {
  return withFallback(apiFetch<Category>(`/categories/${encodeURIComponent(slug)}`), null);
}

export async function getProductBySlug(slug: string) {
  return withFallback(apiFetch<Product>(`/products/${encodeURIComponent(slug)}`), null);
}

export async function getProductBySlugStrict(slug: string) {
  try {
    return await apiFetch<Product>(`/products/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof Error && "status" in error && (error as { status?: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getRelatedProducts(_categoryId: string, productId: string) {
  return withFallback(apiFetch<Product[]>(`/products/${encodeURIComponent(productId)}/related`), []);
}

export async function getProductCompanions(_categoryId: string, productId: string) {
  return withFallback(apiFetch<Product[]>(`/products/${encodeURIComponent(productId)}/companions`), []);
}

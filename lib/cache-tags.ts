/**
 * Catalog reads (categories, products, campaigns) are shared by every
 * storefront route, so invalidating them by path does not reach the header and
 * footer. Tagging the fetches lets an admin edit clear them everywhere at once.
 */
export const catalogTag = "catalog";

export const catalogRevalidateSeconds = Number(process.env.CATALOG_REVALIDATE_SECONDS ?? 60);

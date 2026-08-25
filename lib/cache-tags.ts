/**
 * Catalog reads (categories, products, campaigns) are shared by every
 * storefront route, so invalidating them by path does not reach the header and
 * footer. Tagging the fetches lets an admin edit clear them everywhere at once.
 */
export const catalogTag = "catalog";

export const catalogRevalidateSeconds = Number(process.env.CATALOG_REVALIDATE_SECONDS ?? 60);

/**
 * Order-derived admin reads: the pending-order badge in the sidebar, the
 * dashboard tiles and the reports. Separate from the catalogue tag because
 * these change on every sale rather than on every product edit.
 */
export const ordersTag = "orders";

export const ordersRevalidateSeconds = Number(process.env.ORDERS_REVALIDATE_SECONDS ?? 30);

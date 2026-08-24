import "server-only";

import { ApiError, apiFetch, toQueryString } from "@/lib/api/client";
import type { Order } from "@/lib/types";

export type OrderOwner = {
  userId: string;
  email: string;
};

/**
 * Fetches a single order on behalf of the signed-in customer. The owner is sent
 * to the backend, which enforces the match in SQL, so this cannot be used to
 * read an order belonging to somebody else.
 */
export async function getOrderInvoice(orderId: string, owner: OrderOwner) {
  const query = toQueryString({ userId: owner.userId, email: owner.email });

  try {
    return await apiFetch<Order>(`/orders/${encodeURIComponent(orderId)}${query}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return null;
    }

    throw error;
  }
}

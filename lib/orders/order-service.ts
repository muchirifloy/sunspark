import "server-only";

import { updateTag } from "next/cache";
import { apiFetch } from "@/lib/api/client";
import { catalogTag, ordersTag } from "@/lib/cache-tags";
import { clearCart, getCart } from "@/lib/cart/cart-service";
import { getSession } from "@/lib/auth/session";
import type { Order, PaymentMethod } from "@/lib/types";

export type CheckoutInput = {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryNote?: string;
  deliveryLocation?: string;
  deliveryMapUrl?: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
  paymentMethod: PaymentMethod;
};

export async function createOrderFromCart(input: CheckoutInput) {
  const cart = await getCart();

  if (!cart.items.length) {
    throw new Error("Cart is empty");
  }

  const session = await getSession();
  const order = await apiFetch<Order>("/orders/checkout", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      userId: session?.role === "CUSTOMER" ? session.id : null,
      items: cart.items.map((item) => ({ productId: item.product.id, productOptionId: item.option?.id || null, quantity: item.quantity }))
    })
  });

  await clearCart();
  // A customer checkout is the main source of PENDING orders, so the sidebar
  // badge and the admin order lists must not keep serving a pre-sale count.
  // Checkout also deducts stock, which the catalogue reads cache.
  updateTag(ordersTag);
  updateTag(catalogTag);
  return order;
}

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { catalogTag, ordersTag } from "@/lib/cache-tags";
import { requireAdmin } from "@/lib/auth/guards";
import type { Order } from "@/lib/types";
import type { ActionResult } from "@/lib/actions/result";

export async function createWalkInSaleAction(formData: FormData): Promise<ActionResult> {
  await requireAdmin("/admin/walk-in-sale");
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim() || null;
  const customerPhone = String(formData.get("customerPhone") ?? "").trim() || null;
  const paymentMethod = String(formData.get("paymentMethod") ?? "CASH");
  const productIds = formData.getAll("productId").map(String);
  const optionIds = formData.getAll("productOptionId").map((value) => String(value) || null);
  const quantities = formData.getAll("quantity").map((value) => Number(value));
  const unitCentsValues = formData.getAll("unitCents").map((value) => Number(value));

  if (customerName.length < 2 || !productIds.length || productIds.length !== quantities.length) return { ok: false, message: "Enter the customer name and add at least one product." };
  if (paymentMethod !== "CASH" && paymentMethod !== "MPESA") return { ok: false, message: "Choose Cash or M-Pesa for a completed walk-in sale." };

  const requested = new Map<string, { productId: string; productOptionId: string | null; quantity: number; unitCents: number }>();
  for (let index = 0; index < productIds.length; index += 1) {
    const quantity = quantities[index];
    if (!productIds[index] || !Number.isInteger(quantity) || quantity < 1) return { ok: false, message: "One or more sale quantities are invalid." };
    const unitCents = unitCentsValues[index];
    if (!Number.isInteger(unitCents) || unitCents < 0) return { ok: false, message: "One or more sale prices are invalid." };
    const productOptionId = optionIds[index] ?? null;
    const key = `${productIds[index]}::${productOptionId ?? ""}`;
    const existing = requested.get(key);
    // Merging duplicates keeps the price the operator last set for that line
    // rather than silently averaging two different negotiated prices.
    requested.set(key, {
      productId: productIds[index],
      productOptionId,
      quantity: (existing?.quantity ?? 0) + quantity,
      unitCents
    });
  }

  let order: Order;
  try {
    // Admin-only endpoint. The public /orders/checkout route deliberately does
    // not accept a price, so a counter sale with a negotiated price has to go
    // through the token-guarded one.
    order = await apiFetch<Order>("/admin/walk-in-sales", {
      method: "POST",
      body: JSON.stringify({
        customerName,
        customerEmail,
        customerPhone,
        paymentMethod,
        items: [...requested.values()],
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("stock") || message.includes("available")) return { ok: false, message: "One or more products no longer have enough stock. Adjust the quantities and try again." };
    return { ok: false, message: "The sale could not be completed. Nothing was charged or removed from stock." };
  }
  // No status PATCH here any more: /admin/walk-in-sales records the sale as
  // COMPLETED/PAID inside the same transaction as the stock deduction. The old
  // two-step left a window where a failed second call stranded a paid counter
  // sale as PENDING/UNPAID.

  // A completed sale deducts stock, so the tagged catalogue reads that back the
  // storefront and the admin product picker have to be dropped too.
  updateTag(catalogTag);
  updateTag(ordersTag);
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/admin/products");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  return { ok: true, message: "Sale completed.", redirectTo: `/admin/walk-in-sale/${order.id}/receipt` };
}

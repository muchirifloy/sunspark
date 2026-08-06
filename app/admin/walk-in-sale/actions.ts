"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
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

  if (customerName.length < 2 || !productIds.length || productIds.length !== quantities.length) return { ok: false, message: "Enter the customer name and add at least one product." };
  if (paymentMethod !== "CASH" && paymentMethod !== "MPESA") return { ok: false, message: "Choose Cash or M-Pesa for a completed walk-in sale." };

  const requested = new Map<string, { productId: string; productOptionId: string | null; quantity: number }>();
  for (let index = 0; index < productIds.length; index += 1) {
    const quantity = quantities[index];
    if (!productIds[index] || !Number.isInteger(quantity) || quantity < 1) return { ok: false, message: "One or more sale quantities are invalid." };
    const productOptionId = optionIds[index] ?? null;
    const key = `${productIds[index]}::${productOptionId ?? ""}`;
    const existing = requested.get(key);
    requested.set(key, {
      productId: productIds[index],
      productOptionId,
      quantity: (existing?.quantity ?? 0) + quantity
    });
  }

  let order: Order;
  try {
    order = await apiFetch<Order>("/orders/checkout", {
      method: "POST",
      body: JSON.stringify({
        userId: null,
        customerName,
        customerEmail: customerEmail ?? `walkin-${Date.now()}@sunsparkelectricals.co.ke`,
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
  await apiFetch(`/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED", paymentStatus: "PAID" }) });

  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/admin/products");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/payments");
  return { ok: true, message: "Sale completed.", redirectTo: `/admin/walk-in-sale/${order.id}/receipt` };
}

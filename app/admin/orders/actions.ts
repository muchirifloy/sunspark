"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { OrderStatus, PaymentStatus } from "@/lib/types";
import { requireAdmin, requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch, ApiError } from "@/lib/api/client";
import { catalogTag, ordersTag } from "@/lib/cache-tags";
import type { ActionResult } from "@/lib/actions/result";

const orderStatuses: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "READY", "COMPLETED", "CANCELLED"];
const paymentStatuses: PaymentStatus[] = ["UNPAID", "PENDING", "PAID", "FAILED", "REFUNDED"];

export async function updateOrderAction(orderId: string, formData: FormData): Promise<ActionResult> {
  // Outside the try on purpose. requireAdmin signals a failed check by calling
  // redirect(), which works by throwing -- catching it turned "you are not
  // signed in" into "the order could not be saved" and stranded the operator on
  // a page they no longer had access to.
  await requireAdmin();

  const status = String(formData.get("status") ?? "");
  const paymentStatus = String(formData.get("paymentStatus") ?? "");

  // The backend validates these too. Checking here as well keeps a malformed
  // request from being sent at all, and gives a clearer message than a 400.
  if (!orderStatuses.includes(status as OrderStatus) || !paymentStatuses.includes(paymentStatus as PaymentStatus)) {
    return { ok: false, message: "That order or payment status is not recognised." };
  }

  try {
    await apiFetch(`/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, paymentStatus })
    });
  } catch {
    return { ok: false, message: "Order could not be saved. Your selections are still on screen." };
  }

  // Moving an order to COMPLETED/CANCELLED changes both the sidebar badge and
  // which list the order belongs to, so the cached order reads have to go.
  updateTag(ordersTag);
  return { ok: true, message: "Order saved without reloading." };
}

/**
 * Deleting an order removes the sale outright: its items and its numbered
 * invoice row cascade with it. Whether the stock it consumed comes back is
 * decided by the backend from the order's status -- goods that were already
 * dispatched stay counted as sold.
 */
export async function deleteOrderAction(orderId: string) {
  await requireOwnerAdmin("/admin/orders");

  let outcome: { orderNumber: string; stockRestored: boolean; revertedDocuments: string[] };

  try {
    outcome = await apiFetch<{ orderNumber: string; stockRestored: boolean; revertedDocuments: string[] }>(`/admin/orders/${orderId}`, {
      method: "DELETE"
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    console.error("Order delete failed", { status: error.status, message: error.message });
    redirect(`/admin/orders?error=${error.status === 404 ? "order-missing" : "order-delete"}`);
  }

  // Returning stock changes the catalogue the storefront reads, not just the
  // order lists, so both tags go.
  updateTag(ordersTag);
  if (outcome.stockRestored) {
    updateTag(catalogTag);
    revalidatePath("/");
    revalidatePath("/store");
    revalidatePath("/admin/products");
  }
  revalidatePath("/admin/orders");
  revalidatePath("/admin/orders/past");
  revalidatePath("/admin/invoices");

  const params = new URLSearchParams({
    notice: outcome.stockRestored ? "order-deleted-restored" : "order-deleted-kept",
    ref: outcome.orderNumber
  });
  // Named in the notice because a reverted invoice is the one consequence the
  // operator cannot see from the Orders list they land back on.
  if (outcome.revertedDocuments.length) params.set("doc", outcome.revertedDocuments.join(", "));
  redirect(`/admin/orders?${params.toString()}`);
}

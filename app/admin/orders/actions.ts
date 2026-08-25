"use server";

import { updateTag } from "next/cache";
import { OrderStatus, PaymentStatus } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { ordersTag } from "@/lib/cache-tags";
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

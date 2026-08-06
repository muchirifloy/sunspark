"use server";

import { OrderStatus, PaymentStatus } from "@/lib/types";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import type { ActionResult } from "@/lib/actions/result";

export async function updateOrderAction(orderId: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    await apiFetch(`/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: String(formData.get("status")) as OrderStatus,
        paymentStatus: String(formData.get("paymentStatus")) as PaymentStatus,
      }),
    });
    return { ok: true, message: "Order saved without reloading." };
  } catch {
    return { ok: false, message: "Order could not be saved. Your selections are still on screen." };
  }
}

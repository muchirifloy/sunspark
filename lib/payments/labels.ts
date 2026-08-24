import type { PaymentMethod, PaymentStatus } from "@/lib/types";

const paymentMethodLabels: Record<PaymentMethod, string> = {
  WHATSAPP: "WhatsApp",
  MPESA: "M-Pesa",
  CASH: "Cash"
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded"
};

/**
 * Stored values are upper-case enums. Showing them raw is how "WHATSAPP" and
 * "CASH" ended up in the payments table, so every surface reads its label here.
 */
export function paymentMethodLabel(method: PaymentMethod | string | null | undefined) {
  if (!method) return "Unknown";
  return paymentMethodLabels[method as PaymentMethod] ?? String(method);
}

export function paymentStatusLabel(status: PaymentStatus | string | null | undefined) {
  if (!status) return "Unknown";
  return paymentStatusLabels[status as PaymentStatus] ?? String(status);
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/result";
import type { OrderStatus, PaymentStatus } from "@/lib/types";

export function OrderStatusControls({
  action,
  initialPaymentStatus,
  initialStatus,
  receiptHref,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  initialPaymentStatus: PaymentStatus;
  initialStatus: OrderStatus;
  receiptHref?: string;
}) {
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [status, setStatus] = useState(initialStatus);
  const [savedState, setSavedState] = useState({ paymentStatus: initialPaymentStatus, status: initialStatus });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isDirty = paymentStatus !== savedState.paymentStatus || status !== savedState.status;

  function save() {
    const formData = new FormData();
    formData.set("paymentStatus", paymentStatus);
    formData.set("status", status);
    setMessage("");
    startTransition(async () => {
      const result = await action(formData);
      setMessage(result.message);
      if (result.ok) setSavedState({ paymentStatus, status });
    });
  }

  return (
    <>
      <select aria-label="Payment status" disabled={isPending} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)} value={paymentStatus}>
        <option value="UNPAID">Unpaid</option><option value="PENDING">Pending</option><option value="PAID">Paid</option><option value="FAILED">Failed</option><option value="REFUNDED">Refunded</option>
      </select>
      <select aria-label="Order status" disabled={isPending} onChange={(event) => setStatus(event.target.value as OrderStatus)} value={status}>
        <option value="PENDING">Pending</option><option value="CONFIRMED">Confirmed</option><option value="PROCESSING">Processing</option><option value="READY">Ready</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
      </select>
      <div className="order-admin-actions">
        <button aria-busy={isPending} className="order-save-btn" disabled={isPending || !isDirty} onClick={save} type="button">{isPending ? "Saving..." : isDirty ? "Save" : message && !isDirty ? "Saved ✓" : "Saved"}</button>
        {receiptHref ? <Link className="table-link receipt-link" href={receiptHref}>Receipt</Link> : null}
        {message && !message.startsWith("Order saved") ? <small className="inline-action-error" role="alert">{message}</small> : null}
      </div>
    </>
  );
}

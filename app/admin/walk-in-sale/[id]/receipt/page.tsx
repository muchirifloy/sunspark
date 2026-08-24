import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { PrintReceiptButton } from "@/components/admin/print-receipt-button";
import { SalesDocument } from "@/components/admin/sales-document";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import type { Order } from "@/lib/types";
import { paymentMethodLabel } from "@/lib/payments/labels";

export const dynamic = "force-dynamic";

export default async function WalkInReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/walk-in-sale/${id}/receipt`);
  const order = await apiFetch<Order>(`/admin/orders/${id}`).catch(() => null);
  if (!order) notFound();
  const paymentLabel = paymentMethodLabel(order.paymentMethod);
  const title = order.paymentStatus === "PAID" ? "Receipt" : "Invoice";

  return <AdminLayout title="Sale Complete" subtitle="The sale is recorded, stock is updated, and the document is ready.">
    <div className="receipt-actions"><PrintReceiptButton href={`/admin/walk-in-sale/${order.id}/receipt/download`} label={`Download ${title.toLowerCase()} PDF`} /></div>
    <SalesDocument
      customerEmail={order.customerEmail}
      customerName={order.customerName}
      customerPhone={order.customerPhone}
      date={order.createdAt}
      items={order.items}
      kind={title.toUpperCase() as "RECEIPT" | "INVOICE"}
      number={order.invoice?.invoiceNumber}
      paymentLabel={paymentLabel}
      statusLabel={order.paymentStatus === "PAID" ? "Paid" : "Awaiting payment"}
      subtotalCents={order.subtotalCents}
      totalCents={order.totalCents}
    />
  </AdminLayout>;
}

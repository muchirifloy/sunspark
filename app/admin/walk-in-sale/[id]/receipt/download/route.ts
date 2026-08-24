import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { createSalesDocumentPdf, salesDocumentFilename } from "@/lib/pdf/sales-document-pdf";
import type { Order } from "@/lib/types";
import { paymentMethodLabel } from "@/lib/payments/labels";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/walk-in-sale/${id}/receipt`);
  const order = await apiFetch<Order>(`/admin/orders/${id}`);
  const paymentLabel = paymentMethodLabel(order.paymentMethod);
  const kind = order.paymentStatus === "PAID" ? "RECEIPT" : "INVOICE";
  const number = order.invoice?.invoiceNumber ?? order.orderNumber;
  const pdf = createSalesDocumentPdf({
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    date: order.createdAt,
    items: order.items,
    kind,
    number,
    paymentLabel,
    statusLabel: order.paymentStatus === "PAID" ? "Paid" : "Awaiting payment",
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents
  });

  return new NextResponse(pdf, {
    headers: {
      "content-disposition": `attachment; filename="${salesDocumentFilename({ kind, number, customerName: order.customerName })}"`,
      "content-type": "application/pdf"
    }
  });
}

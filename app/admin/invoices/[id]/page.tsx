import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminLayout } from "@/components/admin/admin-layout";
import { ConfirmDeleteForm } from "@/components/admin/confirm-delete-form";
import { PrintReceiptButton } from "@/components/admin/print-receipt-button";
import { SalesDocument } from "@/components/admin/sales-document";
import { requireAdmin } from "@/lib/auth/guards";
import { canManageCatalog } from "@/lib/auth/roles";
import { deleteSalesDocumentAction } from "../actions";
import { apiFetch } from "@/lib/api/client";
import type { DraftInvoiceKind, DraftInvoiceStatus, OrderItem, PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminInvoiceDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin(`/admin/invoices/${id}`);
  const canDelete = canManageCatalog(admin.role);
  const document = await apiFetch<{
    id: string;
    reference: string;
    kind: DraftInvoiceKind;
    status: DraftInvoiceStatus;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    paymentMethod: PaymentMethod;
    subtotalCents: number;
    totalCents: number;
    createdAt: Date | string;
    orderId?: string | null;
    orderNumber?: string | null;
    orderStatus?: string | null;
    items: OrderItem[];
  }>(`/admin/draft-documents/${id}`).catch(() => null);
  if (!document) notFound();
  const title = document.kind === "QUOTATION" ? "Quotation" : "Invoice";
  const statusLabel = document.kind === "QUOTATION" ? "Quotation" : document.status === "DRAFT" ? "Invoiced" : "Completed";

  return (
    <AdminLayout title={title} subtitle="Review the customer document before printing or sharing.">
      <div className="receipt-actions">{document.status === "DRAFT" ? <Link className="secondary-btn" href={`/admin/invoices/${document.id}/edit`}>Edit {title.toLowerCase()}</Link> : null}<PrintReceiptButton href={`/admin/invoices/${document.id}/download`} label={`Download ${title.toLowerCase()} PDF`} />{canDelete ? <ConfirmDeleteForm
        action={deleteSalesDocumentAction.bind(null, document.id)}
        className="danger-btn"
        confirmMessage={document.orderId
          ? `Delete ${title.toLowerCase()} ${document.reference} for ${document.customerName}?

This is a finalized invoice, so order ${document.orderNumber ?? ""} is deleted with it, along with its items and receipt.

${document.orderStatus === "COMPLETED" ? "Stock stays deducted: that order was already dispatched." : "The stock the sale used will be returned to inventory."}

This cannot be undone.`
          : `Delete ${title.toLowerCase()} ${document.reference} for ${document.customerName}?

No stock was deducted for it, so inventory does not change. This cannot be undone.`}
        label={`Delete ${title.toLowerCase()}`}
      /> : null}</div>
      <SalesDocument
        customerEmail={document.customerEmail}
        customerName={document.customerName}
        customerPhone={document.customerPhone}
        date={document.createdAt}
        items={document.items ?? []}
        kind={document.kind}
        number={document.reference}
        statusLabel={statusLabel}
        subtotalCents={document.subtotalCents}
        totalCents={document.totalCents}
      />
    </AdminLayout>
  );
}

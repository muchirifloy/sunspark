import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { ConfirmDeleteForm } from "@/components/admin/confirm-delete-form";
import { DocumentCreatePanel, type CreateMode } from "@/components/admin/document-create-panel";
import { PendingButton } from "@/components/ui/pending-button";
import { requireAdmin } from "@/lib/auth/guards";
import { canManageCatalog } from "@/lib/auth/roles";
import { apiFetch, toQueryString } from "@/lib/api/client";
import { getSaleProducts } from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import { createDraftInvoiceAction, createQuotationAction, deleteSalesDocumentAction, finalizeDraftInvoiceAction } from "./actions";

export const dynamic = "force-dynamic";

const feedback: Record<string, string> = {
  created: "Draft invoice created. Stock has not changed.",
  quotation: "Quotation created. Stock has not changed.",
  details: "Enter the customer and at least one item.",
  items: "One or more selected products are unavailable.",
  stock: "Stock changed before finalization. Review the invoice and try again.",
  finalize: "This invoice is already finalized or unavailable.",
  "quote-finalize": "Quotations do not change stock. Create or finalize an invoice when the sale is confirmed.",
  "document-deleted": "Document deleted. No stock changed, because none had been deducted for it.",
  "document-deleted-restored": "Document deleted, along with the order it had been finalized into. The stock that sale used is back in inventory.",
  "document-deleted-kept": "Document deleted, along with the order it had been finalized into. Stock stays deducted because that order had already been dispatched.",
  "document-missing": "That document no longer exists. It may already have been deleted.",
  "document-delete": "The document could not be deleted. Nothing was changed -- reload and try again."
};

type DraftDocument = {
  id: string;
  reference: string;
  kind: "INVOICE" | "QUOTATION";
  createdAt: Date | string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  totalCents: number;
  status: "DRAFT" | "COMPLETED" | "CANCELLED";
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  items: unknown[];
};

// The actions redirect with `tab=` on failure while links use `create=`, so both
// are honoured -- otherwise a validation error silently closed the panel and
// threw away whatever the admin had typed.
function initialCreateMode(params?: { create?: string; tab?: string }): CreateMode {
  const requested = params?.create ?? params?.tab;
  return requested === "quotation" ? "quotation" : requested === "invoice" ? "invoice" : "";
}

export default async function InvoicesPage({ searchParams }: { searchParams?: Promise<{ q?: string; create?: string; tab?: string; view?: string; error?: string; notice?: string; message?: string }> }) {
  const admin = await requireAdmin("/admin/invoices");
  const canDelete = canManageCatalog(admin.role);
  const params = await searchParams;
  const message = params?.message ?? (params?.error ? feedback[params.error] : params?.notice ? feedback[params.notice] : null);
  const isPast = params?.view === "past";

  return <AdminLayout title="Invoices & Quotations" subtitle={isPast ? "Finalized and cancelled documents." : "Open drafts and quotations. Finalized ones move to Past documents."}>
    {message ? <p className={`admin-feedback ${params?.error ? "error" : "success"}`} role="status">{message}</p> : null}
    {/* The catalogue and the document list are independent, so neither waits on
        the other. Whichever resolves first paints. */}
    {/* Nothing is created from the archive view, so the catalogue is not even
        fetched there. */}
    {isPast ? null : (
      <AdminSectionErrorBoundary message={"The product catalogue could not be loaded, so new documents cannot be started right now. Reload to try again."}>
        <Suspense fallback={<div className="document-create-actions"><span className="secondary-btn" aria-disabled="true">Create invoice</span><span className="secondary-btn" aria-disabled="true">Create quotation</span></div>}>
          <CreatePanel initialMode={initialCreateMode(params)} />
        </Suspense>
      </AdminSectionErrorBoundary>
    )}
    <form action="/admin/invoices" className="admin-filter">
      <input defaultValue={params?.q ?? ""} name="q" placeholder="Search document, customer, email, phone, item..." />
      {isPast ? <input name="view" type="hidden" value="past" /> : null}
      <button type="submit">Search</button>
      <Link className="filter-reset" href="/admin/invoices">Open documents</Link>
      <Link className="filter-reset" href="/admin/invoices?view=past">Past documents</Link>
    </form>
    <AdminSectionErrorBoundary message="The document list could not be loaded. This is a connection problem, not an empty list -- your invoices and quotations are safe. Reload to try again.">
      <Suspense fallback={<p className="empty-state">Loading documents...</p>}>
        <DocumentTable canDelete={canDelete} isPast={isPast} q={params?.q} />
      </Suspense>
    </AdminSectionErrorBoundary>
  </AdminLayout>;
}

async function CreatePanel({ initialMode }: { initialMode: CreateMode }) {
  const products = await getSaleProducts();

  return <DocumentCreatePanel
    createInvoiceAction={createDraftInvoiceAction}
    createQuotationAction={createQuotationAction}
    initialMode={initialMode}
    products={products}
  />;
}

async function DocumentTable({ canDelete, isPast, q }: { canDelete: boolean; isPast: boolean; q?: string }) {
  const invoices = await getInvoices(q, isPast);

  return <div className="admin-table"><div className="admin-table-row invoice-row heading"><span>Document</span><span>Customer</span><span>Items</span><span>Total</span><span>Status</span><span /></div>
    {invoices.map((invoice) => <div className="admin-table-row invoice-row" key={invoice.id}><strong><Link className="admin-record-link" href={`/admin/invoices/${invoice.id}`}>{invoice.reference}</Link><small>{invoice.kind === "QUOTATION" ? "Quotation" : "Invoice"} | {new Date(invoice.createdAt).toLocaleDateString("en-KE")}</small></strong><span><Link className="admin-record-link" href={`/admin/invoices/${invoice.id}`}>{invoice.customerName}</Link><small>{invoice.customerPhone ?? invoice.customerEmail ?? "No contact"}</small></span><span>{invoice.items.length}</span><strong>{formatMoney(invoice.totalCents)}</strong><span>{invoice.status}</span><div className="table-actions"><Link className="table-link" href={`/admin/invoices/${invoice.id}`}>View</Link>{invoice.status === "DRAFT" ? <Link className="table-link" href={`/admin/invoices/${invoice.id}/edit`}>Edit</Link> : null}{invoice.kind === "INVOICE" && invoice.status === "DRAFT" ? <form action={finalizeDraftInvoiceAction.bind(null, invoice.id)}><PendingButton pendingText="Finalizing...">Finalize</PendingButton></form> : invoice.orderId ? <Link className="table-link" href={`/admin/walk-in-sale/${invoice.orderId}/receipt`}>Receipt</Link> : null}{canDelete ? <ConfirmDeleteForm action={deleteSalesDocumentAction.bind(null, invoice.id)} confirmMessage={documentConfirmMessage(invoice)} /> : null}</div></div>)}
    {!invoices.length ? <p className="empty-state">No documents match this search.</p> : null}
  </div>;
}

/**
 * Spells out the full blast radius before anything goes. A finalized invoice
 * takes its order with it, and whether stock comes back depends on whether that
 * order had already been dispatched -- neither of which is visible from the row.
 */
function documentConfirmMessage(invoice: DraftDocument) {
  const label = invoice.kind === "QUOTATION" ? "quotation" : invoice.orderId ? "invoice" : "draft invoice";
  const lines = `its ${invoice.items.length} line${invoice.items.length === 1 ? "" : "s"}`;
  const head = `Delete ${label} ${invoice.reference} for ${invoice.customerName}?`;

  if (!invoice.orderId) {
    return `${head}

No stock was deducted for it, so inventory does not change. The document and ${lines} are removed for good. This cannot be undone.`;
  }

  const stockNote = invoice.orderStatus === "COMPLETED"
    ? "Stock stays deducted: that order was already dispatched."
    : "The stock the sale used will be returned to inventory.";

  return `${head}

This is a finalized invoice, so order ${invoice.orderNumber ?? ""} is deleted with it, along with its items and receipt.

${stockNote}

The document and ${lines} are removed for good. This cannot be undone.`;
}

async function getInvoices(q: string | undefined, isPast: boolean): Promise<DraftDocument[]> {
  const terms = q?.trim().split(/\s+/).filter(Boolean) ?? [];
  // Deliberately not caught: an empty table and a dead backend must not look
  // the same. The error boundary above states which one it is.
  return apiFetch<DraftDocument[]>(`/admin/draft-documents${toQueryString({ q: terms.join(" "), group: isPast ? "past" : "active" })}`);
}

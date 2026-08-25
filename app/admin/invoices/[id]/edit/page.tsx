import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { WalkInSaleForm } from "@/components/admin/walk-in-sale-form";
import { updateDraftDocumentAction } from "@/app/admin/invoices/actions";
import { requireAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { getSaleProducts } from "@/lib/admin/queries";
import type { DraftInvoiceKind, DraftInvoiceStatus, OrderItem, PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  details: "Enter the customer and at least one item.",
  items: "One or more selected products are unavailable."
};

type DraftDocumentDetail = {
  id: string;
  reference: string;
  kind: DraftInvoiceKind;
  status: DraftInvoiceStatus;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  paymentMethod: PaymentMethod;
  items: OrderItem[];
};

export default async function EditInvoiceDocumentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  await requireAdmin(`/admin/invoices/${id}/edit`);
  // The document decides whether this page renders at all, so it is awaited
  // here. The catalogue only feeds the picker, so it streams in separately
  // rather than holding up the shell.
  const document = await apiFetch<DraftDocumentDetail>(`/admin/draft-documents/${id}`).catch(() => null);

  if (!document || document.status !== "DRAFT") notFound();

  return (
    <AdminLayout title={`Edit ${document.kind === "QUOTATION" ? "Quotation" : "Invoice"}`} subtitle={`Update ${document.reference} before finalizing or sharing.`}>
      {query?.error && errors[query.error] ? <p className="admin-feedback error" role="alert">{errors[query.error]}</p> : null}
      <section className="document-editor-panel">
        <AdminSectionErrorBoundary message={"The product catalogue could not be loaded, so new documents cannot be started right now. Reload to try again."}>
          <Suspense fallback={<p className="empty-state">Loading products...</p>}>
            <EditForm document={document} />
          </Suspense>
        </AdminSectionErrorBoundary>
      </section>
    </AdminLayout>
  );
}

async function EditForm({ document }: { document: DraftDocumentDetail }) {
  const products = await getSaleProducts();

  return (
    <WalkInSaleForm
      action={updateDraftDocumentAction.bind(null, document.id)}
      initialCustomer={{
        name: document.customerName,
        email: document.customerEmail,
        phone: document.customerPhone,
        paymentMethod: document.paymentMethod
      }}
      // unitCents is carried back in so re-opening a negotiated document does
      // not quietly snap every line to the current catalogue price.
      initialLines={document.items
        .map((item) => ({ productId: item.productId ?? "", quantity: item.quantity, unitCents: item.unitCents }))
        .filter((item) => item.productId)}
      products={products}
      submitLabel={`Save ${document.kind === "QUOTATION" ? "quotation" : "invoice"}`}
    />
  );
}

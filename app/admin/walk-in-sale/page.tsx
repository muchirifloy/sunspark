import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { WalkInSaleForm } from "@/components/admin/walk-in-sale-form";
import { requireAdmin } from "@/lib/auth/guards";
import { getSaleProducts } from "@/lib/admin/queries";
import { createWalkInSaleAction } from "./actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  details: "Enter the customer name and at least one product.",
  items: "Review the product quantities and try again.",
  payment: "Choose cash or M-Pesa for a walk-in sale.",
  stock: "One or more selected items are no longer available in the requested quantity."
};

export default async function WalkInSalePage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  await requireAdmin("/admin/walk-in-sale");
  const params = await searchParams;
  return <AdminLayout title="Walk-in Sale" subtitle="Record counter sales, update stock, and issue a receipt.">
    {params?.error && errors[params.error] ? <p className="admin-feedback error" role="alert">{errors[params.error]}</p> : null}
    <AdminSectionErrorBoundary message={"The product catalogue could not be loaded, so new documents cannot be started right now. Reload to try again."}>
      <Suspense fallback={<p className="empty-state">Loading products...</p>}>
        <SaleForm />
      </Suspense>
    </AdminSectionErrorBoundary>
  </AdminLayout>;
}

async function SaleForm() {
  const products = await getSaleProducts(true);
  return <WalkInSaleForm action={createWalkInSaleAction} products={products} />;
}

import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { ProductForm } from "@/components/admin/product-form";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import type { Category } from "@/lib/types";
import { createProductAction } from "../actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  duplicate: "A product with that name already exists.",
  image: "The image could not be uploaded.",
  save: "The product could not be saved. Please try again."
};

async function NewProductForm() {
  const categories = await getCategories();
  return <ProductForm action={createProductAction} categories={categories} />;
}

export default async function NewProductPage({ searchParams }: { searchParams?: Promise<{ error?: string; message?: string }> }) {
  await requireOwnerAdmin();
  const params = await searchParams;

  return (
    <AdminLayout title="Add Product" subtitle="Create product details, stock, pricing, and image gallery.">
      <div className="admin-shell product-editor-shell">
        {params?.error && messages[params.error] ? <p className="admin-feedback error" role="alert">{params.message ?? messages[params.error]}</p> : null}
        {/* The form needs the category list, so it streams; the page frame does not
            wait on it. */}
        <AdminSectionErrorBoundary message="The category list could not be loaded, so a product cannot be created right now. Reload to try again.">
          <Suspense fallback={<div className="admin-card-skeleton" style={{ height: 420 }} aria-busy="true" />}>
            <NewProductForm />
          </Suspense>
        </AdminSectionErrorBoundary>
      </div>
    </AdminLayout>
  );
}

async function getCategories() {
  try {
    return await apiFetch<Category[]>("/categories");
  } catch {
    return [];
  }
}

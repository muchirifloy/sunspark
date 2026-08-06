import { AdminLayout } from "@/components/admin/admin-layout";
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

export default async function NewProductPage({ searchParams }: { searchParams?: Promise<{ error?: string; message?: string }> }) {
  await requireOwnerAdmin();
  const params = await searchParams;
  const categories = await getCategories();

  return (
    <AdminLayout title="Add Product" subtitle="Create product details, stock, pricing, and image gallery.">
      <div className="admin-shell product-editor-shell">
        {params?.error && messages[params.error] ? <p className="admin-feedback error" role="alert">{params.message ?? messages[params.error]}</p> : null}
        <ProductForm action={createProductAction} categories={categories} />
      </div>
    </AdminLayout>
  );
}

async function getCategories() {
  try {
    return apiFetch<Category[]>("/categories");
  } catch {
    return [];
  }
}

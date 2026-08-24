import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { ProductForm } from "@/components/admin/product-form";
import { mergeProductDescriptions } from "@/lib/products/rich-text";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import type { Category, Product } from "@/lib/types";
import { updateProductAction } from "../../actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  duplicate: "A product with that name already exists.",
  image: "The image could not be uploaded.",
  save: "The product could not be saved. Please try again."
};

export default async function EditProductPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  await requireOwnerAdmin();
  const { id } = await params;
  const query = await searchParams;
  const [product, categories] = await Promise.all([getProduct(id), getCategories()]);

  if (!product) {
    notFound();
  }

  return (
    <AdminLayout title="Edit Product" subtitle={product.name}>
      <div className="admin-shell product-editor-shell">
        {query?.error && messages[query.error] ? <p className="admin-feedback error" role="alert">{query.message ?? messages[query.error]}</p> : null}
        <ProductForm
          action={updateProductAction.bind(null, product.id)}
          categories={categories}
          descriptionHtml={mergeProductDescriptions(product.shortDescription, product.description)}
          product={product}
        />
      </div>
    </AdminLayout>
  );
}

async function getProduct(id: string) {
  try {
    return apiFetch<Product>(`/admin/products/${id}`);
  } catch {
    return null;
  }
}

async function getCategories() {
  try {
    return apiFetch<Category[]>("/categories");
  } catch {
    return [];
  }
}

import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/admin/admin-layout";
import { ProductForm } from "@/components/admin/product-form";
import { mergeProductDescriptions } from "@/lib/products/rich-text";
import type { Category, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

async function previewOnlyAction(_formData: FormData) {
  "use server";
  return { ok: true as const, message: "Preview only. No product was changed." };
}

export default function ProductEditorPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const category: Category = {
    id: "preview-category",
    name: "Solar Lighting",
    slug: "solar-lighting",
    description: "Solar lights and accessories",
    parentId: null,
    isActive: true,
    sortOrder: 1,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    productCount: 1,
    images: [],
    products: [],
    children: [],
  };

  const product: Product = {
    id: "preview-product",
    name: "100W Solar Flood Light (Waterproof IP67)",
    slug: "100w-solar-flood-light",
    brand: "Sunspark",
    shortDescription: "High brightness solar flood light with remote control and weatherproof housing.",
    description: "<p>This solar flood light is designed for powerful illumination in outdoor areas.</p><ul><li>High brightness LED</li><li>Remote control included</li><li>Weatherproof housing</li></ul>",
    priceCents: 450000,
    compareAtCents: 550000,
    costCents: 320000,
    sellingUnit: "UNIT",
    stockQuantity: 48,
    lowStockThreshold: 10,
    isActive: true,
    isFeatured: true,
    isHotDeal: false,
    seoTitle: "100W Solar Flood Light in Kenya",
    seoDescription: "Waterproof 100W solar flood light available from Sunspark.",
    seoKeywords: "solar flood light, outdoor light, 100w",
    categoryId: category.id,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    category,
    images: [
      { id: "preview-image-1", productId: "preview-product", url: "/logo-header.webp", alt: "Sunspark solar product", isPrimary: true, sortOrder: 0, createdAt: "2026-08-06T00:00:00.000Z" },
      { id: "preview-image-2", productId: "preview-product", url: "/logo.jpg", alt: "Sunspark product alternate", isPrimary: false, sortOrder: 1, createdAt: "2026-08-06T00:00:00.000Z" },
    ],
    options: [
      { id: "preview-option", productId: "preview-product", label: "Unit", sellingUnit: "UNIT", priceCents: 450000, compareAtCents: 550000, costCents: 320000, stockMultiplier: 1, isDefault: true, sortOrder: 0, createdAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
    ],
  };

  return (
    <AdminLayout pendingOrderCountOverride={12} title="Edit Product" subtitle="Local design preview · saving is disabled">
      <div className="admin-shell product-editor-shell">
        <ProductForm
          action={previewOnlyAction}
          categories={[category]}
          descriptionHtml={mergeProductDescriptions(product.shortDescription, product.description)}
          product={product}
        />
      </div>
    </AdminLayout>
  );
}

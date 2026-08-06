"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api/client";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { getImageUploadError, saveProductImages } from "@/lib/uploads/product-images";
import { productInputSchema, slugifyProductName } from "@/lib/products/validation";
import { sanitizeRichText } from "@/lib/products/rich-text";
import type { ActionResult } from "@/lib/actions/result";

function amountToCents(value: FormDataEntryValue | null) {
  const numeric = Number(String(value ?? "0"));
  return Math.round((Number.isFinite(numeric) ? numeric : 0) * 100);
}

function parseProductForm(formData: FormData) {
  const options = parseOptionRows(formData);
  const defaultOption = options.find((option) => option.isDefault) ?? options[0];
  const input = productInputSchema.parse({
    name: formData.get("name"),
    brand: String(formData.get("brand") ?? "").trim() || undefined,
    categoryId: formData.get("categoryId"),
    description: sanitizeRichText(String(formData.get("description") ?? "")) || undefined,
    priceCents: defaultOption?.priceCents ?? 0,
    compareAtCents: defaultOption?.compareAtCents,
    costCents: defaultOption?.costCents ?? 0,
    sellingUnit: defaultOption?.sellingUnit ?? "UNIT",
    stockQuantity: formData.get("stockQuantity"),
    lowStockThreshold: formData.get("lowStockThreshold"),
    isActive: formData.get("isActive") === "on",
    isFeatured: formData.get("isFeatured") === "on",
    isHotDeal: formData.get("isHotDeal") === "on",
    seoTitle: String(formData.get("seoTitle") ?? "").trim() || undefined,
    seoDescription: String(formData.get("seoDescription") ?? "").trim() || undefined,
    seoKeywords: String(formData.get("seoKeywords") ?? "").trim() || undefined
  });

  return { input, options };
}

function getImageFiles(formData: FormData) {
  return formData.getAll("images").filter((value): value is File => value instanceof File);
}

function getDeleteImageIds(formData: FormData) {
  return formData.getAll("deleteImageIds").map(String).filter(Boolean);
}

function getDeleteOptionIds(formData: FormData) {
  return formData.getAll("deleteOptionIds").map(String).filter(Boolean);
}

function parseOptionRows(formData: FormData) {
  const ids = formData.getAll("optionId").map((value) => String(value) || null);
  const labels = formData.getAll("optionLabel").map((value) => String(value).trim());
  const units = formData.getAll("optionSellingUnit").map((value) => String(value || "UNIT"));
  const priceValues = formData.getAll("optionPriceKsh");
  const compareValues = formData.getAll("optionCompareAtKsh");
  const costValues = formData.getAll("optionCostKsh");
  const multipliers = formData.getAll("optionStockMultiplier");
  const defaultOptionKey = String(formData.get("defaultOptionKey") ?? "");

  return labels.flatMap((label, index) => {
    const hasPrice = String(priceValues[index] ?? "").trim() !== "";
    if (!label && !hasPrice) return [];
    return [{
      id: ids[index],
      label: label || units[index] || "Unit",
      sellingUnit: units[index] || "UNIT",
      priceCents: amountToCents(priceValues[index] ?? null),
      compareAtCents: String(compareValues[index] ?? "").trim() ? amountToCents(compareValues[index]) : undefined,
      costCents: String(costValues[index] ?? "").trim() ? amountToCents(costValues[index]) : 0,
      stockMultiplier: Math.max(Number(String(multipliers[index] ?? "1")) || 1, 0.01),
      isDefault: ids[index]
        ? defaultOptionKey === `id:${ids[index]}`
        : defaultOptionKey === `index:${index}`,
      sortOrder: index
    }];
  });
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message.slice(0, 180);
  }

  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }

  return "The request could not be completed.";
}

function productErrorPath(path: string, code: string, message?: string) {
  const params = new URLSearchParams({ error: code });
  if (message) params.set("message", message);
  return `${path}?${params.toString()}`;
}

function isRedirectError(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}

export async function createProductAction(formData: FormData): Promise<ActionResult> {
  await requireOwnerAdmin();

  try {
    const { input, options } = parseProductForm(formData);
    const files = getImageFiles(formData);
    const imageError = getImageUploadError(files);
    if (imageError) return { ok: false, message: imageError };

    const images = await saveProductImages(files, input.name);
    const slug = slugifyProductName(input.name);

    await apiFetch("/admin/products", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        slug,
        options,
        images: images.map((image, index) => ({ ...image, isPrimary: index === 0, sortOrder: index }))
      })
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    const message = errorMessage(error);
    console.error("Product create failed", { status, message });
    return { ok: false, message: status === 409 ? `A matching product already exists. ${message}` : message };
  }

  revalidatePath("/");
  revalidatePath("/store");
  return { ok: true, message: "Product created.", redirectTo: "/admin/products" };
}

export async function updateProductAction(productId: string, formData: FormData): Promise<ActionResult> {
  await requireOwnerAdmin();

  try {
    const { input, options } = parseProductForm(formData);
    const files = getImageFiles(formData);
    const imageError = getImageUploadError(files);
    if (imageError) return { ok: false, message: imageError };

    const images = await saveProductImages(files, input.name);
    const primaryImageId = String(formData.get("primaryImageId") ?? "");
    const deleteImageIds = getDeleteImageIds(formData);

    await apiFetch(`/admin/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...input,
        slug: slugifyProductName(input.name),
        options,
        deleteOptionIds: getDeleteOptionIds(formData),
        images: images.map((image, index) => ({ ...image, isPrimary: false, sortOrder: index })),
        deleteImageIds,
        primaryImageId: primaryImageId || null
      })
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    const message = errorMessage(error);
    console.error("Product update failed", { status, message });
    return { ok: false, message: status === 409 ? `A matching product already exists. ${message}` : message };
  }

  revalidatePath("/");
  revalidatePath("/store");
  return { ok: true, message: "Product changes saved without reloading." };
}

export async function deleteProductAction(productId: string) {
  await requireOwnerAdmin();

  try {
    await apiFetch(`/admin/products/${productId}`, { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    redirect(`/admin/products?error=${error.status === 409 ? "delete-linked" : "delete"}`);
  }

  revalidatePath("/");
  revalidatePath("/store");
  redirect("/admin/products?notice=deleted");
}

export async function hideProductAction(productId: string) {
  await requireOwnerAdmin();

  await apiFetch(`/admin/products/${productId}/hide`, { method: "PATCH" });

  revalidatePath("/");
  revalidatePath("/store");
  redirect("/admin/products?notice=hidden");
}

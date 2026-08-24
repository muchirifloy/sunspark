"use server";

import { revalidatePath, updateTag } from "next/cache";
import { catalogTag } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch, ApiError } from "@/lib/api/client";
import { slugifyProductName } from "@/lib/products/validation";
import { saveCategoryImages } from "@/lib/uploads/product-images";
import { getImageUploadError } from "@/lib/uploads/product-images";

function getImageFiles(formData: FormData) {
  return formData.getAll("images").filter((value): value is File => value instanceof File);
}

function getDeleteImageIds(formData: FormData) {
  return formData.getAll("deleteImageIds").map(String).filter(Boolean);
}

function limitWords(value: string, count: number) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

function categoryErrorUrl(path: string, error: unknown) {
  if (!(error instanceof ApiError)) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "The category could not be saved.");
    return `${path}?error=save&message=${message}`;
  }
  const reason = error.status === 409 ? "duplicate" : error.status === 413 ? "image" : "save";
  const message = encodeURIComponent(error.message || "The category could not be saved.");
  return `${path}?error=${reason}&message=${message}`;
}

export async function createCategoryAction(formData: FormData) {
  await requireOwnerAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = limitWords(String(formData.get("description") ?? ""), 15);
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const files = getImageFiles(formData);

  if (name.length < 2) {
    redirect("/admin/categories?error=invalid");
  }

  if (getImageUploadError(files)) redirect("/admin/categories?error=image");

  const slug = slugifyProductName(name);
  try {
    const images = await saveCategoryImages(files, name);
    await apiFetch("/admin/categories", {
      method: "POST",
      body: JSON.stringify({
      name,
      slug,
      description: description || null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: formData.get("isActive") === "on",
      images: images.map((image, index) => ({ ...image, isPrimary: index === 0, sortOrder: index }))
      })
    });
  } catch (error) {
    redirect(categoryErrorUrl("/admin/categories", error));
  }

  updateTag(catalogTag);
  revalidatePath("/");
  revalidatePath("/store");
  redirect("/admin/categories?notice=saved");
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  await requireOwnerAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = limitWords(String(formData.get("description") ?? ""), 15);
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const files = getImageFiles(formData);
  const primaryImageId = String(formData.get("primaryImageId") ?? "");
  const deleteImageIds = getDeleteImageIds(formData);

  if (name.length < 2) {
    redirect(`/admin/categories/${categoryId}/edit?error=invalid`);
  }

  if (getImageUploadError(files)) redirect(`/admin/categories/${categoryId}/edit?error=image`);

  const slug = slugifyProductName(name);
  try {
    const images = await saveCategoryImages(files, name);
    await apiFetch(`/admin/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name,
        slug,
        description: description || null,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        isActive: formData.get("isActive") === "on",
        images: images.map((image, index) => ({ ...image, isPrimary: false, sortOrder: index })),
        deleteImageIds,
        primaryImageId: primaryImageId || null
      })
    });
  } catch (error) {
    redirect(categoryErrorUrl(`/admin/categories/${categoryId}/edit`, error));
  }

  updateTag(catalogTag);
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath(`/category/${slug}`);
  redirect("/admin/categories");
}

export async function deleteCategoryAction(categoryId: string) {
  await requireOwnerAdmin();

  try {
    await apiFetch(`/admin/categories/${categoryId}`, { method: "DELETE" });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    redirect(`/admin/categories?error=${error.status === 409 ? "delete-linked" : "delete"}`);
  }

  updateTag(catalogTag);
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?notice=deleted");
}

export async function hideCategoryAction(categoryId: string) {
  await requireOwnerAdmin();

  await apiFetch(`/admin/categories/${categoryId}/hide`, { method: "PATCH" });

  updateTag(catalogTag);
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/admin/categories");
  redirect("/admin/categories?notice=hidden");
}

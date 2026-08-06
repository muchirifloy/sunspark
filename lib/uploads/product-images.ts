import "server-only";

import { apiFetch } from "@/lib/api/client";

const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const maxBytes = 2 * 1024 * 1024;

export type SavedProductImage = {
  url: string;
  alt: string;
};

export function getImageUploadError(files: File[]) {
  const invalidFile = files.find((file) => file.size && (!allowedTypes.has(file.type) || file.size > maxBytes));

  if (!invalidFile) {
    return null;
  }

  if (!allowedTypes.has(invalidFile.type)) {
    return "Images must be JPEG, PNG, or WebP.";
  }

  return "Each image must be smaller than 2 MB.";
}

function safeExtension(file: File) {
  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

async function fileToUpload(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());

  return {
    filename: file.name || `image.${safeExtension(file)}`,
    type: file.type,
    dataBase64: buffer.toString("base64")
  };
}

export async function saveUploadedImages(
  files: File[],
  name: string,
  folder: "products" | "categories"
): Promise<SavedProductImage[]> {
  const validFiles = files.filter((file) => file.size && allowedTypes.has(file.type) && file.size <= maxBytes);
  if (!validFiles.length) return [];

  const payload = await Promise.all(validFiles.map(fileToUpload));
  const result = await apiFetch<{ images: SavedProductImage[] }>("/admin/uploads", {
    method: "POST",
    body: JSON.stringify({ folder, name, files: payload })
  });

  return result.images;
}

export async function saveProductImages(files: File[], productName: string): Promise<SavedProductImage[]> {
  return saveUploadedImages(files, productName, "products");
}

export async function saveCategoryImages(files: File[], categoryName: string): Promise<SavedProductImage[]> {
  return saveUploadedImages(files, categoryName, "categories");
}

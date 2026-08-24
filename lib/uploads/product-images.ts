import "server-only";

import { apiFetch } from "@/lib/api/client";

const allowedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
// Phone and supplier photos routinely exceed 2 MB, which meant admins could not
// upload them at all. The backend now downscales to IMAGE_MAX_DIMENSION before
// storing, so a larger upload still lands well under a megabyte on disk.
const maxUploadMb = 5;
const maxBytes = maxUploadMb * 1024 * 1024;

// Every image in a gallery save travels in one base64 Server Action body, and
// base64 costs a third more than the raw bytes. Checking the whole batch here
// turns "request body too large" into something an admin can act on.
const serverActionBodyMb = 32;
const base64Overhead = 4 / 3;
const maxBatchBytes = Math.floor((serverActionBodyMb * 1024 * 1024) / base64Overhead) - 1024 * 1024;

export type SavedProductImage = {
  url: string;
  alt: string;
};

export function getImageUploadError(files: File[]) {
  const invalidFile = files.find((file) => file.size && (!allowedTypes.has(file.type) || file.size > maxBytes));

  if (invalidFile) {
    if (!allowedTypes.has(invalidFile.type)) {
      return "Images must be JPEG, PNG, or WebP.";
    }

    return `Each image must be smaller than ${maxUploadMb} MB.`;
  }

  const batchBytes = files.reduce((total, file) => total + (file.size || 0), 0);

  if (batchBytes > maxBatchBytes) {
    return "These images are too large to upload together. Add them in smaller batches.";
  }

  return null;
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

"use server";

import { revalidatePath, updateTag } from "next/cache";
import { catalogTag } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { saveUploadedImages } from "@/lib/uploads/product-images";

function imageFiles(formData: FormData) {
  return formData.getAll("images").filter((value): value is File => value instanceof File);
}

export async function createCampaignAction(formData: FormData) {
  await requireOwnerAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const images = await saveUploadedImages(imageFiles(formData), title, "categories");

  if (title.length < 2) {
    redirect("/admin/campaigns?error=invalid");
  }

  await apiFetch("/admin/campaigns", {
    method: "POST",
    body: JSON.stringify({
      title,
      description: description || null,
      imageUrl: images[0]?.url ?? null,
      badge: String(formData.get("badge") ?? "").trim() || null,
      offerLabel: String(formData.get("offerLabel") ?? "").trim() || null,
      ctaLabel: String(formData.get("ctaLabel") ?? "").trim() || null,
      ctaUrl: String(formData.get("ctaUrl") ?? "").trim() || null,
      endsAt: String(formData.get("endsAt") ?? "").trim() || null,
      isActive: formData.get("isActive") === "on"
    })
  });

  updateTag(catalogTag);
  revalidatePath("/");
  redirect("/admin/campaigns");
}

export async function updateCampaignAction(campaignId: string, formData: FormData) {
  await requireOwnerAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const images = await saveUploadedImages(imageFiles(formData), title, "categories");

  await apiFetch(`/admin/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title,
      description: description || null,
      imageUrl: images[0]?.url ?? null,
      badge: String(formData.get("badge") ?? "").trim() || null,
      offerLabel: String(formData.get("offerLabel") ?? "").trim() || null,
      ctaLabel: String(formData.get("ctaLabel") ?? "").trim() || null,
      ctaUrl: String(formData.get("ctaUrl") ?? "").trim() || null,
      endsAt: String(formData.get("endsAt") ?? "").trim() || null,
      isActive: formData.get("isActive") === "on"
    })
  });

  updateTag(catalogTag);
  revalidatePath("/");
  redirect("/admin/campaigns");
}

export async function deleteCampaignAction(campaignId: string) {
  await requireOwnerAdmin();

  await apiFetch(`/admin/campaigns/${campaignId}`, { method: "DELETE" });

  updateTag(catalogTag);
  revalidatePath("/");
  redirect("/admin/campaigns");
}

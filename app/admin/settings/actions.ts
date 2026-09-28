"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch, ApiError } from "@/lib/api/client";
import { settingsTag } from "@/lib/cache-tags";
import { siteConfig } from "@/lib/site-config";

export async function updateSettingsAction(formData: FormData) {
  await requireOwnerAdmin();

  try {
    await apiFetch("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        storeName: String(formData.get("name") ?? "Sunspark Electricals & Solar").trim(),
        supportEmail: String(formData.get("email") ?? siteConfig.email).trim() || siteConfig.email,
        reportEmail: String(formData.get("reportRecipient") ?? siteConfig.reportEmail).trim() || siteConfig.reportEmail,
        whatsappPhone: String(formData.get("whatsappPhone") ?? siteConfig.whatsappPhone).trim(),
        currency: "KSH"
      })
    });
  } catch (error) {
    if (error instanceof ApiError) redirect(`/admin/settings?error=save&message=${encodeURIComponent(error.message)}`);
    throw error;
  }

  updateTag(settingsTag);
  revalidatePath("/");
  redirect("/admin/settings?notice=saved");
}

import { cache } from "react";
import { apiFetch } from "@/lib/api/client";
import { settingsRevalidateSeconds, settingsTag } from "@/lib/cache-tags";
import { siteConfig } from "@/lib/site-config";

type SiteSettingsRow = {
  store_name?: string | null;
  support_email?: string | null;
  whatsapp_phone?: string | null;
};

export type StoreSettings = {
  name: string;
  email: string;
  whatsappPhone: string;
};

// Read from site settings so the shop can change its WhatsApp number without a
// deploy. Falls back to the static config if the API is unreachable, the same
// safety net every other catalogue read on the storefront uses.
export const getStoreSettings = cache(async (): Promise<StoreSettings> => {
  try {
    const settings = await apiFetch<SiteSettingsRow | null>("/settings", {
      next: { revalidate: settingsRevalidateSeconds, tags: [settingsTag] }
    });

    return {
      name: settings?.store_name?.trim() || siteConfig.name,
      email: settings?.support_email?.trim() || siteConfig.email,
      whatsappPhone: settings?.whatsapp_phone?.trim() || siteConfig.whatsappPhone
    };
  } catch {
    return { name: siteConfig.name, email: siteConfig.email, whatsappPhone: siteConfig.whatsappPhone };
  }
});

/** 254703586562 -> +254703586562, for on-page display. Link targets keep the raw digits. */
export function formatWhatsAppDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `+${digits}` : phone;
}

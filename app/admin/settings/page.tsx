import { AdminLayout } from "@/components/admin/admin-layout";
import { PendingButton } from "@/components/ui/pending-button";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { siteConfig } from "@/lib/site-config";
import { updateSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

type SettingsView = {
  site: {
    name?: string;
    email?: string;
    location?: string;
    facebookUrl?: string;
    mapUrl?: string;
  } | null;
  checkout: {
    whatsappPhone?: string;
    whatsappEnabled: boolean;
    mpesaEnabled: boolean;
  } | null;
  reports: {
    recipient?: string;
    reportTime?: string;
    weekdays?: string;
    enabled?: boolean;
  } | null;
};

const messages: Record<string, string> = {
  saved: "Settings saved.",
  save: "Settings could not be saved. Review the fields and try again."
};

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; notice?: string; message?: string }>;
}) {
  await requireOwnerAdmin();
  const params = await searchParams;
  const settings = await getSettings();
  const feedback = params?.error ? params.message ?? messages[params.error] : params?.notice ? messages[params.notice] : null;

  return (
    <AdminLayout title="Settings" subtitle="Business identity, contact links, checkout methods, and payment availability.">
      {feedback ? <p className={params?.error ? "admin-feedback error" : "admin-feedback success"} role="status">{feedback}</p> : null}
      <form action={updateSettingsAction} className="settings-dashboard">
        <section className="settings-card settings-card-wide">
          <div className="settings-card-header">
            <div><span>Business</span><h2>Business identity</h2><p>Shown on customer contact areas, reports, and store documents.</p></div>
          </div>
          <div className="settings-fields">
            <label><span>Business name</span><input name="name" defaultValue={settings.site?.name ?? siteConfig.name} /></label>
            <label><span>Support email</span><input name="email" defaultValue={settings.site?.email ?? siteConfig.email} /></label>
            <label><span>WhatsApp phone</span><input name="whatsappPhone" defaultValue={settings.checkout?.whatsappPhone ?? siteConfig.whatsappPhone} /></label>
            <p className="settings-field-full admin-note">Shown on the storefront (footer, help chat, checkout) as the single contact number, in +254 format.</p>
            <label className="settings-field-full"><span>Location</span><input name="location" defaultValue={settings.site?.location ?? siteConfig.location} /></label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-header">
            <div><span>Reports</span><h2>Daily reporting</h2><p>Sales and profit summaries.</p></div>
          </div>
          <div className="settings-fields single">
            <label><span>Recipient email</span><input name="reportRecipient" type="email" defaultValue={settings.reports?.recipient ?? siteConfig.reportEmail} /></label>
            <label><span>Send time</span><input name="reportTime" type="time" defaultValue={settings.reports?.reportTime ?? "20:00"} /></label>
            <label><span>Weekdays</span><input name="reportWeekdays" defaultValue={settings.reports?.weekdays ?? "1,2,3,4,5"} /></label>
            <label className="settings-toggle"><input name="reportEnabled" type="checkbox" defaultChecked={settings.reports?.enabled ?? false} /><span>Automatic daily report</span></label>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-header">
            <div><span>Checkout</span><h2>Checkout and links</h2><p>Payment options and public links.</p></div>
          </div>
          <div className="settings-fields single">
            <label className="settings-toggle"><input name="whatsappEnabled" type="checkbox" defaultChecked={settings.checkout?.whatsappEnabled ?? true} /><span>WhatsApp checkout enabled</span></label>
            <label className="settings-toggle"><input name="mpesaEnabled" type="checkbox" defaultChecked={settings.checkout?.mpesaEnabled ?? false} /><span>M-Pesa checkout enabled</span></label>
            <label><span>Facebook URL</span><input name="facebookUrl" defaultValue={settings.site?.facebookUrl ?? siteConfig.facebookUrl} /></label>
            <label><span>Map URL</span><input name="mapUrl" defaultValue={settings.site?.mapUrl ?? siteConfig.mapUrl} /></label>
          </div>
          <div className="admin-note">
            <strong>Google Merchant feed</strong>
            <a href="/google-merchant.xml" rel="noreferrer" target="_blank">/google-merchant.xml</a>
          </div>
        </section>

        <div className="settings-savebar">
          <span>Save changes to apply store settings.</span>
          <PendingButton pendingText="Saving settings...">Save settings</PendingButton>
        </div>
      </form>
    </AdminLayout>
  );
}

async function getSettings(): Promise<SettingsView> {
  try {
    const settings = await apiFetch<{ store_name?: string; support_email?: string; report_email?: string; whatsapp_phone?: string }>("/settings");
    return {
      site: settings ? { name: settings.store_name, email: settings.support_email, location: siteConfig.location, facebookUrl: siteConfig.facebookUrl, mapUrl: siteConfig.mapUrl } : null,
      checkout: settings ? { whatsappPhone: settings.whatsapp_phone, whatsappEnabled: true, mpesaEnabled: false } : null,
      reports: settings ? { recipient: settings.report_email } : null
    };
  } catch {
    return { site: null, checkout: null, reports: null };
  }
}

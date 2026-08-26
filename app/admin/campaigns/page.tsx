import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
import { PendingButton } from "@/components/ui/pending-button";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import { apiFetch } from "@/lib/api/client";
import { createCampaignAction, deleteCampaignAction, updateCampaignAction } from "./actions";
import { publicImageUrl } from "@/lib/products/images";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; status?: string; edit?: string }>;
}) {
  await requireOwnerAdmin();
  const params = await searchParams;

  return (
    <AdminLayout title="Campaigns" subtitle="Create storefront promotions for deals, seasonal offers, and featured pushes.">
      <form action="/admin/campaigns" className="admin-filter">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search campaigns..." />
        <select name="status" defaultValue={params?.status ?? ""}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
        </select>
        <button type="submit">Filter</button>
      </form>

      <section className="campaign-admin-layout">
        <form action={createCampaignAction} className="campaign-editor">
          <div className="campaign-editor-heading">
            <span>New Campaign</span>
            <h2>Create a selling offer</h2>
            <p>Use a strong image, short offer text, and a clear action.</p>
          </div>
          <div className="form-grid two">
            <label>Title<input name="title" placeholder="Weekend solar deal" required /></label>
            <label>Badge<input name="badge" placeholder="20% OFF" /></label>
            <label>Offer line<input name="offerLabel" placeholder="Buy inverter + battery at a fixed price" /></label>
            <label>Deal ends<input name="endsAt" type="datetime-local" /></label>
          </div>
          <label>Description<textarea name="description" rows={3} placeholder="Short text that sells the campaign." /></label>
          <div className="form-grid two">
            <label>Button text<input name="ctaLabel" placeholder="Buy this offer" /></label>
            <label>Button link<input name="ctaUrl" placeholder="/store?q=solar" /></label>
          </div>
          <div className="form-grid two">
            <label>Campaign image<input name="images" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <label className="check-label"><input name="isActive" type="checkbox" defaultChecked />Active on website</label>
          </div>
          <PendingButton pendingText="Adding campaign...">Add campaign</PendingButton>
        </form>
      </section>

      {/* The frame and the "create campaign" form need no data, so they paint at once.
          Only the edit panel and the list below wait on the backend. */}
      <AdminSectionErrorBoundary message="Campaigns could not be loaded. This is a connection problem, not an empty list. Reload to try again.">
        <Suspense fallback={<div className="campaign-admin-list" aria-busy="true"><span className="admin-card-skeleton" /><span className="admin-card-skeleton" /><span className="admin-card-skeleton" /></div>}>
          <CampaignData edit={params?.edit} q={params?.q} status={params?.status} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

async function CampaignData({ edit, q, status }: { edit?: string; q?: string; status?: string }) {
  const campaigns = await getCampaigns({ q, status });
  const editingCampaign = campaigns.find((campaign) => campaign.id === edit);

  return (
    <>
      {editingCampaign ? (
        <section className="campaign-edit-shell" id="edit-campaign">
          <div className="campaign-editor-heading">
            <span>Edit Campaign</span>
            <h2>{editingCampaign.title}</h2>
            <p>Update the offer, deadline, image, and storefront action.</p>
          </div>
          <form action={updateCampaignAction.bind(null, editingCampaign.id)} className="campaign-editor campaign-edit-form">
            <div className="form-grid two">
              <label>Title<input name="title" defaultValue={editingCampaign.title} required /></label>
              <label>Badge<input name="badge" defaultValue={editingCampaign.badge ?? ""} placeholder="20% OFF" /></label>
              <label>Offer line<input name="offerLabel" defaultValue={editingCampaign.offerLabel ?? ""} placeholder="Buy inverter + battery at a fixed price" /></label>
              <label>Deal ends<input name="endsAt" type="datetime-local" defaultValue={editingCampaign.endsAt ? new Date(editingCampaign.endsAt).toISOString().slice(0, 16) : ""} /></label>
            </div>
            <label>Description<textarea name="description" defaultValue={editingCampaign.description ?? ""} rows={4} placeholder="Short, clear selling message." /></label>
            <div className="form-grid three">
              <label>Button text<input name="ctaLabel" defaultValue={editingCampaign.ctaLabel ?? ""} placeholder="Buy this offer" /></label>
              <label>Button link<input name="ctaUrl" defaultValue={editingCampaign.ctaUrl ?? ""} placeholder="/store?q=solar" /></label>
              <label>Replace image<input name="images" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            </div>
            {editingCampaign.imageUrl ? (
              <div className="campaign-current-image">
                <img alt={editingCampaign.title} src={publicImageUrl(editingCampaign.imageUrl)} />
                <span>Current campaign image</span>
              </div>
            ) : null}
            <div className="campaign-card-actions">
              <label className="check-label"><input name="isActive" type="checkbox" defaultChecked={editingCampaign.isActive} />Active on website</label>
              <div className="campaign-action-buttons">
                <Link className="secondary-btn" href="/admin/campaigns">Cancel</Link>
                <PendingButton pendingText="Saving campaign...">Save campaign</PendingButton>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      <div className="campaign-admin-list">
        {campaigns.map((campaign) => (
          <article className="campaign-admin-row" key={campaign.id}>
            {campaign.imageUrl ? <img className="campaign-row-thumb" alt={campaign.title} src={publicImageUrl(campaign.imageUrl)} /> : <div className="campaign-row-thumb campaign-thumb-empty">No image</div>}
            <div className="campaign-row-main">
              <strong>{campaign.title}</strong>
              <span>{campaign.badge || "No badge"} | {campaign.offerLabel || "No offer line"} | {campaign.endsAt ? `Ends ${new Date(campaign.endsAt).toLocaleString("en-KE")}` : "No end time"}</span>
            </div>
            <span className={campaign.isActive ? "status-pill active" : "status-pill"}>{campaign.isActive ? "Active" : "Hidden"}</span>
            <div className="campaign-row-actions">
              <Link className="secondary-btn" href={`/admin/campaigns?edit=${campaign.id}#edit-campaign`}>Edit</Link>
              <form action={deleteCampaignAction.bind(null, campaign.id)}>
                <button className="danger-btn" type="submit">Delete</button>
              </form>
            </div>
          </article>
        ))}
        {!campaigns.length ? <p className="empty-state">No campaigns yet. Create the first active offer.</p> : null}
      </div>
    </>
  );
}

async function getCampaigns(input: { q?: string; status?: string }) {
  const q = input.q?.trim();
  try {
    const campaigns = await apiFetch<Campaign[]>("/admin/campaigns");
    return campaigns.filter((campaign) => {
      const matchesQ = q ? `${campaign.title} ${campaign.description ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true;
      const matchesStatus = input.status === "active" ? campaign.isActive : input.status === "hidden" ? !campaign.isActive : true;
      return matchesQ && matchesStatus;
    });
  } catch {
    return [];
  }
}

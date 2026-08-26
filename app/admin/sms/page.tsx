import Link from "next/link";
import { AdminLayout } from "@/components/admin/admin-layout";
import { MessageComposer, type AudienceCounts } from "@/components/admin/message-composer";
import { apiFetch } from "@/lib/api/client";
import { requireAdmin } from "@/lib/auth/guards";
import { canManageCatalog } from "@/lib/auth/roles";
import { refreshDeliveryReportsAction, sendCampaignAction, sendSingleSmsAction } from "./actions";

export const dynamic = "force-dynamic";

type SmsMessage = {
  id: string;
  recipient: string;
  purpose: string;
  senderId: string;
  channel: "TRANSACTIONAL" | "PROMOTIONAL";
  message: string;
  segments: number;
  providerMessageId: string | null;
  status: string;
  responseCode: string | null;
  detail: string | null;
  createdAt: string;
};

type Campaign = {
  id: string;
  name: string;
  channel: string;
  audience: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  status: string;
  detail: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type MessagingOverview = {
  configuration: {
    configured: boolean;
    promotionalReady: boolean;
    transactionalSenderId: string | null;
    promotionalSenderId: string | null;
    transactionalEnabled: boolean;
    marketingEnabled: boolean;
    dryRun: boolean;
  };
  brand: { name: string; phone: string; website: string; signature: string };
  balance: unknown;
  topUp: { url: string; paybill: string; account: string };
  audience: AudienceCounts;
  campaigns: Campaign[];
  messages: SmsMessage[];
  last30Days: { byStatus: Record<string, number>; segmentsByChannel: Record<string, number> };
};

const emptyOverview: MessagingOverview = {
  configuration: { configured: false, promotionalReady: false, transactionalSenderId: null, promotionalSenderId: null, transactionalEnabled: false, marketingEnabled: false, dryRun: false },
  brand: { name: "Sunspark", phone: "", website: "sunsparkelectricals.co.ke", signature: "" },
  balance: null,
  topUp: { url: "https://celcomafrica.com", paybill: "2007272", account: "SUNSPARK" },
  audience: {},
  campaigns: [],
  messages: [],
  last30Days: { byStatus: {}, segmentsByChannel: {} }
};

const views = ["reports", "bulk", "email", "single"] as const;
type View = (typeof views)[number];

const statusLabels: Record<string, string> = {
  DELIVERED: "Delivered",
  SENT: "Sent",
  PENDING: "Pending",
  FAILED: "Failed",
  UNDELIVERED: "Not delivered"
};

const purposeLabels: Record<string, string> = {
  ORDER_RECEIVED: "Order received",
  ORDER_PROCESSING: "Order processing",
  ORDER_COMPLETED: "Order complete",
  WALK_IN_SALE: "Walk-in sale",
  CUSTOMER_SERVICE: "Customer service",
  MARKETING: "Promotional"
};

export default async function BulkSmsPage({
  searchParams
}: {
  searchParams?: Promise<{ view?: string; channel?: string; error?: string; notice?: string; message?: string }>;
}) {
  const session = await requireAdmin("/admin/sms");
  // Bulk sending spends money and speaks for the shop to every contact it holds, so it
  // is the owner's to do - the same line Campaigns and Store Settings already draw.
  // Staff keep the delivery log and single replies to a customer about their order.
  const isOwner = canManageCatalog(session.role);
  const params = await searchParams;
  const requested = (views.includes(params?.view as View) ? params?.view : "reports") as View;
  // Not merely hidden: a staff member typing ?view=bulk lands back on the reports tab,
  // and sendCampaignAction refuses again on the server even if the form is replayed.
  const view = !isOwner && (requested === "bulk" || requested === "email") ? "reports" : requested;
  const overview = await getOverview();
  const feedback = params?.error ? params.message ?? "The request could not be completed." : params?.notice ?? null;

  return (
    <AdminLayout
      title="Bulk SMS"
      subtitle="Order texts, promotional campaigns, and what the gateway said about every message."
    >
      <nav className="report-tabs" aria-label="Messaging section">
        <Link className={view === "reports" ? "active" : ""} href="/admin/sms">Reports & balance</Link>
        {isOwner ? <Link className={view === "bulk" ? "active" : ""} href="/admin/sms?view=bulk">Send bulk SMS</Link> : null}
        {isOwner ? <Link className={view === "email" ? "active" : ""} href="/admin/sms?view=email">Send bulk email</Link> : null}
        <Link className={view === "single" ? "active" : ""} href="/admin/sms?view=single">Single SMS</Link>
      </nav>

      {feedback ? <p className={`admin-feedback ${params?.error ? "error" : "success"}`} role="status">{feedback}</p> : null}
      <ConfigurationNotice configuration={overview.configuration} />

      {view === "reports" ? <Reports channel={params?.channel} overview={overview} /> : null}
      {view === "bulk" ? (
        <MessageComposer
          action={sendCampaignAction}
          audience={overview.audience}
          mode="bulk-sms"
          promotionalReady={overview.configuration.promotionalReady}
          signature={overview.brand.signature}
          smsConfigured={overview.configuration.configured}
          website={overview.brand.website}
        />
      ) : null}
      {view === "email" ? (
        <MessageComposer
          action={sendCampaignAction}
          audience={overview.audience}
          mode="bulk-email"
          promotionalReady
          signature=""
          smsConfigured
          website={overview.brand.website}
        />
      ) : null}
      {view === "single" ? (
        <MessageComposer
          action={sendSingleSmsAction}
          audience={overview.audience}
          mode="single"
          // Staff answer customers; only the owner may pick the promotional sender.
          promotionalReady={isOwner && overview.configuration.promotionalReady}
          signature={overview.brand.signature}
          smsConfigured={overview.configuration.configured}
          website={overview.brand.website}
        />
      ) : null}
    </AdminLayout>
  );
}

function ConfigurationNotice({ configuration }: { configuration: MessagingOverview["configuration"] }) {
  if (!configuration.configured) {
    return (
      <p className="admin-feedback error" role="status">
        SMS is not configured. Add CELCOM_SMS_API_KEY, CELCOM_SMS_PARTNER_ID, and a sender ID to the API environment,
        then restart the API. Nothing is sent until all three are set.
      </p>
    );
  }

  const warnings = [
    configuration.dryRun ? "Dry run is on: messages are composed and logged but never sent." : "",
    !configuration.transactionalEnabled ? "Order texts are switched off." : "",
    !configuration.marketingEnabled ? "Promotional sends are switched off." : "",
    !configuration.promotionalReady
      ? "No promotional sender ID is set, so bulk and promotional sends are blocked. Order texts are unaffected. Set CELCOM_SMS_SENDER_ID_PROMOTIONAL in the API environment once Celcom issues the shortcode - marketing is never sent under the transactional one."
      : ""
  ].filter(Boolean);

  if (!warnings.length) return null;
  return <p className="admin-feedback error" role="status">{warnings.join(" ")}</p>;
}

function Reports({ channel, overview }: { channel?: string; overview: MessagingOverview }) {
  const filter = channel === "TRANSACTIONAL" || channel === "PROMOTIONAL" ? channel : null;
  const messages = filter ? overview.messages.filter((row) => row.channel === filter) : overview.messages;
  const credit = readBalance(overview.balance);
  const segments = overview.last30Days.segmentsByChannel;
  const totalSegments = Object.values(segments).reduce((sum, value) => sum + value, 0);
  const delivered = overview.last30Days.byStatus.DELIVERED ?? 0;
  const failed = (overview.last30Days.byStatus.FAILED ?? 0) + (overview.last30Days.byStatus.UNDELIVERED ?? 0);

  return (
    <>
      <div className="sms-cards">
        <article className="sms-card balance">
          <span>SMS balance</span>
          <strong>{credit ?? "Unavailable"}</strong>
          <small>{credit ? "Credits remaining on the Celcom account" : "Celcom did not return a balance. Check the credentials, then refresh this page."}</small>
        </article>

        <article className="sms-card recharge">
          <span>Recharge</span>
          <dl>
            <div><dt>Paybill</dt><dd>{overview.topUp.paybill}</dd></div>
            <div><dt>Account</dt><dd>{overview.topUp.account}</dd></div>
          </dl>
          <a href={overview.topUp.url} rel="noreferrer noopener" target="_blank">Open Celcom portal</a>
        </article>

        <article className="sms-card">
          <span>Sent in 30 days</span>
          <strong>{totalSegments}</strong>
          <small>{segments.TRANSACTIONAL ?? 0} order texts, {segments.PROMOTIONAL ?? 0} promotional. Counted in billed segments, not messages.</small>
        </article>

        <article className="sms-card">
          <span>Delivery</span>
          <strong>{delivered} delivered</strong>
          <small>{failed} failed or not delivered in the last 30 days.</small>
        </article>
      </div>

      <div className="sms-toolbar">
        <div className="sms-filter">
          <Link className={!filter ? "active" : ""} href="/admin/sms">All</Link>
          <Link className={filter === "TRANSACTIONAL" ? "active" : ""} href="/admin/sms?channel=TRANSACTIONAL">Order texts</Link>
          <Link className={filter === "PROMOTIONAL" ? "active" : ""} href="/admin/sms?channel=PROMOTIONAL">Promotional</Link>
        </div>
        <form action={refreshDeliveryReportsAction}>
          <button type="submit">Refresh delivery reports</button>
        </form>
      </div>

      <h2 className="sms-section-title">Campaigns</h2>
      <div className="admin-table">
        <div className="admin-table-row sms-campaign-row heading">
          <span>Campaign</span><span>Channel</span><span>Recipients</span><span>Sent</span><span>Failed</span><span>Status</span>
        </div>
        {overview.campaigns.map((campaign) => (
          <div className="admin-table-row sms-campaign-row" key={campaign.id}>
            <span>
              <strong>{campaign.name}</strong>
              <small>{new Date(campaign.createdAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}{campaign.detail ? ` — ${campaign.detail}` : ""}</small>
            </span>
            <span>{campaign.channel.replace("_AND_", " + ").toLowerCase()}</span>
            <span>{campaign.recipientCount}</span>
            <strong>{campaign.successCount}</strong>
            <span>{campaign.failureCount}</span>
            <span className={`sms-pill ${campaign.status.toLowerCase()}`}>{campaign.status.toLowerCase()}</span>
          </div>
        ))}
        {!overview.campaigns.length ? <p className="empty-state">No bulk send has been run yet.</p> : null}
      </div>

      <h2 className="sms-section-title">Message log</h2>
      <div className="admin-table">
        <div className="admin-table-row sms-message-row heading">
          <span>Sent</span><span>To</span><span>Reason</span><span>Message</span><span>Parts</span><span>Status</span>
        </div>
        {messages.map((row) => (
          <div className="admin-table-row sms-message-row" key={row.id}>
            <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}</time>
            <span>{row.recipient}<small>{row.senderId}</small></span>
            <span>{purposeLabels[row.purpose] ?? row.purpose}</span>
            <span className="sms-message-body" title={row.message}>{row.message}</span>
            <span>{row.segments}</span>
            <span className={`sms-pill ${row.status.toLowerCase()}`} title={row.detail ?? undefined}>
              {statusLabels[row.status] ?? row.status}
            </span>
          </div>
        ))}
        {!messages.length ? <p className="empty-state">No messages have been sent yet.</p> : null}
      </div>
    </>
  );
}

async function getOverview() {
  return apiFetch<MessagingOverview>("/admin/messaging/overview").catch(() => emptyOverview);
}

/**
 * Pulls a credit figure out of whatever Celcom returned.
 *
 * Their balance payload is not documented field by field, so rather than assume a shape
 * this looks for the first plausible numeric credit value. A wrong number here would be
 * worse than none, so anything unrecognised reports as unavailable.
 */
function readBalance(payload: unknown): string | null {
  const seek = (value: unknown, depth = 0): number | null => {
    if (depth > 4 || value === null || typeof value !== "object") return null;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/credit|balance|bal|amount/i.test(key)) {
        const numeric = Number(String(entry).replace(/[^0-9.-]/g, ""));
        if (Number.isFinite(numeric)) return numeric;
      }
    }
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const nested = seek(entry, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  };

  const credit = seek(payload);
  return credit === null ? null : credit.toLocaleString("en-KE");
}

import Link from "next/link";
import { Suspense } from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminSectionErrorBoundary } from "@/components/admin/admin-section-error-boundary";
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
  const feedback = params?.error ? params.message ?? "The request could not be completed." : params?.notice ?? null;

  return (
    <AdminLayout
      title="Bulk SMS"
      subtitle="Order texts, campaigns, and delivery results."
    >
      <nav className="report-tabs" aria-label="Messaging section">
        <Link className={view === "reports" ? "active" : ""} href="/admin/sms">Reports & balance</Link>
        {isOwner ? <Link className={view === "bulk" ? "active" : ""} href="/admin/sms?view=bulk">Send bulk SMS</Link> : null}
        {isOwner ? <Link className={view === "email" ? "active" : ""} href="/admin/sms?view=email">Send bulk email</Link> : null}
        <Link className={view === "single" ? "active" : ""} href="/admin/sms?view=single">Single SMS</Link>
      </nav>

      {feedback ? <p className={`admin-feedback ${params?.error ? "error" : "success"}`} role="status">{feedback}</p> : null}

      {/* Tabs and the page frame paint at once. The balance is a round trip to Celcom
          and the log is a table scan, so both stream in behind them. */}
      <AdminSectionErrorBoundary message="The messaging data could not be loaded. Reload to try again.">
        <Suspense fallback={<MessagingSkeleton view={view} />} key={`${view}-${params?.channel ?? ""}`}>
          <MessagingSection channel={params?.channel} isOwner={isOwner} view={view} />
        </Suspense>
      </AdminSectionErrorBoundary>
    </AdminLayout>
  );
}

async function MessagingSection({ channel, isOwner, view }: { channel?: string; isOwner: boolean; view: View }) {
  const { overview, reachable } = await getOverview();

  return (
    <>
      {reachable ? <ConfigurationNotice configuration={overview.configuration} /> : (
        <p className="admin-feedback error" role="status">
          Backend not reachable — figures below are unknown, not empty.
        </p>
      )}

      {view === "reports" ? <Reports channel={channel} overview={overview} /> : null}
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
    </>
  );
}

function MessagingSkeleton({ view }: { view: View }) {
  if (view !== "reports") return <div className="sms-composer admin-card-skeleton" aria-busy="true" style={{ height: 320 }} />;

  return (
    <div aria-busy="true">
      <div className="sms-cards">
        {[0, 1, 2, 3].map((card) => <span className="admin-card-skeleton" key={card} />)}
      </div>
      <div className="admin-table" style={{ marginTop: 18 }}>
        {[0, 1, 2, 3, 4].map((row) => (
          <div className="admin-table-row sms-message-row admin-row-skeleton" key={row}>
            <span /><span /><span /><span /><span /><span />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigurationNotice({ configuration }: { configuration: MessagingOverview["configuration"] }) {
  if (!configuration.configured) {
    return <p className="admin-feedback error" role="status">SMS not configured.</p>;
  }

  // Kept to a glance. The operator needs to know what is off, not how it is configured -
  // the long explanation belongs in apps/api/.env.example, where the fix is applied.
  const warnings = [
    configuration.dryRun ? "Dry run on — nothing is sent." : "",
    !configuration.transactionalEnabled ? "Order texts off." : "",
    !configuration.marketingEnabled ? "Promotional sends off." : "",
    !configuration.promotionalReady ? "Promotional sender ID not configured." : ""
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
          <small>{credit ? "Celcom credits remaining" : "Balance could not be read"}</small>
        </article>

        <article className="sms-card recharge">
          <span>Recharge</span>
          <dl>
            <div><dt>Paybill</dt><dd>{overview.topUp.paybill}</dd></div>
            <div><dt>Account</dt><dd>{overview.topUp.account}</dd></div>
          </dl>
          <a href={overview.topUp.url} rel="noreferrer noopener" target="_blank">Celcom portal &rarr;</a>
        </article>

        <article className="sms-card">
          <span>Sent · 30 days</span>
          <strong>{totalSegments}</strong>
          <small>{segments.TRANSACTIONAL ?? 0} order &middot; {segments.PROMOTIONAL ?? 0} promotional &middot; billed segments</small>
        </article>

        <article className="sms-card">
          <span>Delivered · 30 days</span>
          <strong>{delivered}</strong>
          <small>{failed} failed or undelivered</small>
        </article>
      </div>

      <div className="sms-toolbar">
        <div className="sms-filter">
          <Link className={!filter ? "active" : ""} href="/admin/sms">All</Link>
          <Link className={filter === "TRANSACTIONAL" ? "active" : ""} href="/admin/sms?channel=TRANSACTIONAL">Order texts</Link>
          <Link className={filter === "PROMOTIONAL" ? "active" : ""} href="/admin/sms?channel=PROMOTIONAL">Promotional</Link>
        </div>
        <form action={refreshDeliveryReportsAction}>
          <button type="submit">Refresh statuses</button>
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

async function getOverview(): Promise<{ overview: MessagingOverview; reachable: boolean }> {
  // Reachability is tracked rather than swallowed. Falling back to the empty overview
  // silently made a backend outage render as "SMS is not configured", sending whoever
  // was on call to re-enter Celcom credentials that were never the problem - the same
  // mistake the sign-in page used to make with passwords.
  try {
    return { overview: await apiFetch<MessagingOverview>("/admin/messaging/overview"), reachable: true };
  } catch {
    return { overview: emptyOverview, reachable: false };
  }
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

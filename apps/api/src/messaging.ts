/**
 * Bulk and single sends from the admin: who receives them, what is recorded, and how a
 * long campaign runs without the dashboard sitting on an open request.
 *
 * The audience is assembled from every contact the shop has ever captured - registered
 * accounts, online orders, counter sales, and quotations - deduplicated across all four,
 * because the same person routinely appears in more than one.
 */

import { execute, query } from "./db.js";
import { sendEmail } from "./email.js";
import { env } from "./env.js";
import { campaignEmailHtml, plainText, type EmailBrand, type EmailContent } from "./email-template.js";
import { id } from "./id.js";
import { sendComposedSms, smsBrand } from "./sms.js";
import { smsRecipient } from "./sms-templates.js";

export const audienceSources = ["REGISTERED_CUSTOMERS", "ORDER_CUSTOMERS", "WALK_IN_CUSTOMERS", "QUOTE_CONTACTS"] as const;
export type AudienceSource = (typeof audienceSources)[number];

export type Contact = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

// Counter sales with no email of their own are recorded against a synthetic address so
// the order row stays valid. Mailing it would bounce every message straight back.
const PLACEHOLDER_EMAIL = /^walkin-[^@]+@/i;

function usableEmail(value: string | null | undefined) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email.includes("@") || PLACEHOLDER_EMAIL.test(email)) return null;
  return email;
}

type ContactRow = { name: string | null; email: string | null; phone: string | null };

/**
 * Every contact matching the chosen sources, deduplicated.
 *
 * Keyed on the phone number first: one person may have used two email addresses across
 * a web order and a counter sale, and texting them twice costs money and goodwill.
 */
export async function resolveAudience(input: { sources: AudienceSource[]; lookbackDays?: number }) {
  const sources = new Set(input.sources.length ? input.sources : audienceSources);
  const since = input.lookbackDays && input.lookbackDays > 0
    ? new Date(Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000)
    : null;
  const window = (column: string) => (since ? ` AND ${column} >= ?` : "");
  const windowValue = since ? [since] : [];

  const [registered, online, walkIn, quotes] = await Promise.all([
    sources.has("REGISTERED_CUSTOMERS")
      ? query<ContactRow>(
          `SELECT name, email, phone FROM users WHERE role = 'CUSTOMER'${window("created_at")}`,
          windowValue
        )
      : Promise.resolve([]),
    sources.has("ORDER_CUSTOMERS")
      ? query<ContactRow>(
          `SELECT customer_name AS name, customer_email AS email, customer_phone AS phone
           FROM orders WHERE source = 'ONLINE' AND status <> 'CANCELLED'${window("created_at")}`,
          windowValue
        )
      : Promise.resolve([]),
    sources.has("WALK_IN_CUSTOMERS")
      ? query<ContactRow>(
          `SELECT customer_name AS name, customer_email AS email, customer_phone AS phone
           FROM orders WHERE source = 'WALK_IN' AND status <> 'CANCELLED'${window("created_at")}`,
          windowValue
        )
      : Promise.resolve([]),
    sources.has("QUOTE_CONTACTS")
      ? query<ContactRow>(
          `SELECT customer_name AS name, customer_email AS email, customer_phone AS phone
           FROM draft_documents${since ? " WHERE created_at >= ?" : ""}`,
          windowValue
        )
      : Promise.resolve([])
  ]);

  const contacts = new Map<string, Contact>();

  for (const row of [...registered, ...online, ...walkIn, ...quotes]) {
    const phone = smsRecipient(row.phone);
    const email = usableEmail(row.email);
    if (!phone && !email) continue;

    const key = phone ? `p:${phone}` : `e:${email}`;
    const existing = contacts.get(key);
    if (existing) {
      // A later row may carry the half the first one was missing.
      existing.email ??= email;
      existing.name ??= row.name?.trim() || null;
      continue;
    }
    contacts.set(key, { name: row.name?.trim() || null, email, phone });
  }

  return [...contacts.values()];
}

/** Contacts typed or pasted into the composer, rather than pulled from the database. */
export function manualContacts(value: string) {
  const contacts: Contact[] = [];
  const seen = new Set<string>();

  for (const entry of value.split(/[\s,;]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const phone = smsRecipient(trimmed);
    const email = phone ? null : usableEmail(trimmed);
    if (!phone && !email) continue;
    const key = phone ? `p:${phone}` : `e:${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({ name: null, email, phone });
  }

  return contacts;
}

export async function audienceCounts() {
  const rows = await Promise.all(audienceSources.map(async (source) => {
    const contacts = await resolveAudience({ sources: [source] });
    return [source, {
      total: contacts.length,
      withPhone: contacts.filter((contact) => contact.phone).length,
      withEmail: contacts.filter((contact) => contact.email).length
    }] as const;
  }));

  const all = await resolveAudience({ sources: [...audienceSources] });
  return {
    ...Object.fromEntries(rows),
    ALL: { total: all.length, withPhone: all.filter((c) => c.phone).length, withEmail: all.filter((c) => c.email).length }
  } as Record<string, { total: number; withPhone: number; withEmail: number }>;
}

export async function emailBrand(): Promise<EmailBrand> {
  const [settings] = await query<{ store_name: string | null; support_email: string | null; whatsapp_phone: string | null }>(
    "SELECT store_name, support_email, whatsapp_phone FROM site_settings WHERE id = 'default' LIMIT 1"
  );
  const brand = await smsBrand();

  return {
    // Email is not billed per character, so it gets the full trading name.
    name: settings?.store_name?.trim() || "Sunspark Electricals & Solar",
    phone: brand.phone,
    website: brand.website,
    supportEmail: settings?.support_email?.trim() || env("SUPPORT_EMAIL", "support@sunsparkelectricals.co.ke")
  };
}

export type CampaignChannel = "SMS" | "EMAIL" | "SMS_AND_EMAIL";

export type CampaignInput = {
  name: string;
  channel: CampaignChannel;
  subject: string;
  message: string;
  heading?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  sources: AudienceSource[];
  lookbackDays: number;
  manual: string;
};

type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  subject: string | null;
  message: string;
  audience: string;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  status: string;
  detail: string | null;
  created_at: Date;
  finished_at: Date | null;
};

/**
 * Starts a campaign and hands back straight away.
 *
 * A few hundred emails means a few hundred sequential SMTP conversations, which is far
 * longer than the dashboard's request budget. The row is written first and updated as
 * the send proceeds, so the reports tab is the progress indicator rather than a spinner
 * on a request that would have timed out anyway.
 */
export async function startCampaign(input: CampaignInput) {
  const manual = manualContacts(input.manual);
  // A pasted list is an explicit instruction and replaces the audience filters entirely.
  const contacts = manual.length ? manual : await resolveAudience({ sources: input.sources, lookbackDays: input.lookbackDays });
  const wantsSms = input.channel !== "EMAIL";
  const wantsEmail = input.channel !== "SMS";
  const phones = wantsSms ? contacts.map((contact) => contact.phone).filter(Boolean) as string[] : [];
  const emails = wantsEmail ? contacts.map((contact) => contact.email).filter(Boolean) as string[] : [];
  const recipientCount = wantsSms && wantsEmail ? contacts.length : wantsSms ? phones.length : emails.length;

  if (!recipientCount) {
    return { id: null, recipientCount: 0, smsRecipients: 0, emailRecipients: 0, error: "No contact in this audience has the details this channel needs." };
  }

  const audience = manual.length ? "MANUAL" : input.sources.join(",") || "ALL";
  const campaignId = id("cmp");

  await execute(
    `INSERT INTO message_campaigns (id, name, channel, subject, message, audience, recipient_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SENDING')`,
    [campaignId, input.name, input.channel, input.subject || null, input.message, audience, recipientCount]
  );

  void runCampaign(campaignId, input, phones, emails, contacts)
    .catch(async (error) => {
      console.error("Campaign failed", { campaignId, error });
      await execute(
        "UPDATE message_campaigns SET status = 'FAILED', detail = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
        [String(error instanceof Error ? error.message : error).slice(0, 255), campaignId]
      ).catch(() => undefined);
    });

  return { id: campaignId, recipientCount, smsRecipients: phones.length, emailRecipients: emails.length, error: null };
}

async function runCampaign(campaignId: string, input: CampaignInput, phones: string[], emails: string[], contacts: Contact[]) {
  let success = 0;
  let failure = 0;
  const notes: string[] = [];

  if (phones.length) {
    // MARKETING routes the send through the promotional sender ID. Celcom attaches the
    // opt-out to promotional traffic itself, so nothing is appended here.
    const outcome = await sendComposedSms({ to: phones, body: input.message, purpose: "MARKETING", campaignId });
    success += outcome.sent;
    failure += outcome.failed;
    if (outcome.skipped) notes.push(`SMS skipped: ${outcome.skipped}`);
  }

  if (emails.length) {
    const brand = await emailBrand();
    const subject = input.subject.trim() || input.name;
    const content: EmailContent = {
      heading: input.heading?.trim() || undefined,
      body: input.message,
      buttonLabel: input.buttonLabel?.trim() || undefined,
      buttonUrl: input.buttonUrl?.trim() || undefined
    };
    // The body is identical for everyone, so the HTML is built once rather than per
    // recipient - a few hundred renders of the same template is wasted work.
    const html = campaignEmailHtml(subject, content, brand);
    const text = plainText({ heading: content.heading, body: input.message, buttonLabel: content.buttonLabel, buttonUrl: content.buttonUrl, brand });

    // Paced deliberately. Shared cPanel mailboxes cut a sender off for the rest of the
    // hour when messages arrive faster than their limit allows, and the campaign is
    // already running in the background, so nobody is waiting on it.
    const pause = Number(env("BULK_EMAIL_DELAY_MS", "400"));

    for (const to of emails) {
      try {
        await sendEmail({ to, subject, text, html });
        success += 1;
      } catch (error) {
        failure += 1;
        console.error("Campaign email failed", { campaignId, to, error });
        if (notes.length < 3) notes.push(`${to}: ${error instanceof Error ? error.message : "send failed"}`);
      }
      if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }

  const skippedContacts = contacts.length - Math.max(phones.length, emails.length);
  if (skippedContacts > 0 && input.channel !== "SMS_AND_EMAIL") {
    notes.push(`${skippedContacts} contact${skippedContacts === 1 ? "" : "s"} had no ${input.channel === "SMS" ? "phone number" : "email address"}.`);
  }

  await execute(
    `UPDATE message_campaigns
     SET status = ?, success_count = ?, failure_count = ?, detail = ?, finished_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [failure && !success ? "FAILED" : failure ? "PARTIAL" : "SENT", success, failure, notes.join(" ").slice(0, 255) || null, campaignId]
  );
}

export async function campaignHistory(limit = 30) {
  const rows = await query<CampaignRow>(
    "SELECT * FROM message_campaigns ORDER BY created_at DESC LIMIT ?",
    [Math.min(Math.max(limit, 1), 100)]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    channel: row.channel,
    subject: row.subject,
    message: row.message,
    audience: row.audience,
    recipientCount: Number(row.recipient_count ?? 0),
    successCount: Number(row.success_count ?? 0),
    failureCount: Number(row.failure_count ?? 0),
    status: row.status,
    detail: row.detail,
    createdAt: row.created_at,
    finishedAt: row.finished_at
  }));
}

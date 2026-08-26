/**
 * Bulk and single sends from the admin: who receives them, what is recorded, and how a
 * long campaign runs without the dashboard sitting on an open request.
 *
 * The audience is assembled from every contact the shop has ever captured - registered
 * accounts, online orders, counter sales, and quotations - deduplicated across all four,
 * because the same person routinely appears in more than one.
 */
import { cached, invalidate } from "./cache.js";
import { execute, query } from "./db.js";
import { sendEmail } from "./email.js";
import { env } from "./env.js";
import { campaignEmailHtml, plainText } from "./email-template.js";
import { id } from "./id.js";
import { sendComposedSms, smsBrand } from "./sms.js";
import { smsRecipient } from "./sms-templates.js";
export const audienceSources = ["REGISTERED_CUSTOMERS", "ORDER_CUSTOMERS", "WALK_IN_CUSTOMERS", "QUOTE_CONTACTS"];
// Counter sales with no email of their own are recorded against a synthetic address so
// the order row stays valid. Mailing it would bounce every message straight back.
const PLACEHOLDER_EMAIL = /^walkin-[^@]+@/i;
function usableEmail(value) {
    const email = String(value ?? "").trim().toLowerCase();
    if (!email.includes("@") || PLACEHOLDER_EMAIL.test(email))
        return null;
    return email;
}
/**
 * Every contact matching the chosen sources, deduplicated.
 *
 * Keyed on the phone number first: one person may have used two email addresses across
 * a web order and a counter sale, and texting them twice costs money and goodwill.
 */
/**
 * Every contact row for the chosen sources, in one query.
 *
 * A UNION ALL rather than a query per source: the admin tab needs all four counts at
 * once, and issuing them separately meant four scans of the same two tables, then a
 * fifth pass to count the union. Only the three columns a send actually uses are
 * selected, so a large customer list stays cheap to move.
 */
async function contactRows(sources, since) {
    const parts = [];
    const values = [];
    const window = (column) => {
        if (!since)
            return "";
        values.push(since);
        return ` AND ${column} >= ?`;
    };
    if (sources.has("REGISTERED_CUSTOMERS")) {
        parts.push(`SELECT 'REGISTERED_CUSTOMERS' AS src, name, email, phone FROM users WHERE role = 'CUSTOMER'${window("created_at")}`);
    }
    if (sources.has("ORDER_CUSTOMERS")) {
        parts.push(`SELECT 'ORDER_CUSTOMERS' AS src, customer_name, customer_email, customer_phone
                FROM orders WHERE source = 'ONLINE' AND status <> 'CANCELLED'${window("created_at")}`);
    }
    if (sources.has("WALK_IN_CUSTOMERS")) {
        parts.push(`SELECT 'WALK_IN_CUSTOMERS' AS src, customer_name, customer_email, customer_phone
                FROM orders WHERE source = 'WALK_IN' AND status <> 'CANCELLED'${window("created_at")}`);
    }
    if (sources.has("QUOTE_CONTACTS")) {
        parts.push(`SELECT 'QUOTE_CONTACTS' AS src, customer_name, customer_email, customer_phone
                FROM draft_documents WHERE 1 = 1${window("created_at")}`);
    }
    if (!parts.length)
        return [];
    return query(parts.join(" UNION ALL "), values);
}
/** Deduplicated contacts, keyed on phone first so nobody is texted twice. */
function dedupe(rows) {
    const contacts = new Map();
    for (const row of rows) {
        const phone = smsRecipient(row.phone);
        const email = usableEmail(row.email);
        if (!phone && !email)
            continue;
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
export async function resolveAudience(input) {
    const sources = new Set(input.sources.length ? input.sources : audienceSources);
    const since = input.lookbackDays && input.lookbackDays > 0
        ? new Date(Date.now() - input.lookbackDays * 24 * 60 * 60 * 1000)
        : null;
    return dedupe(await contactRows(sources, since));
}
/** Contacts typed or pasted into the composer, rather than pulled from the database. */
export function manualContacts(value) {
    const contacts = [];
    const seen = new Set();
    for (const entry of value.split(/[\s,;]+/)) {
        const trimmed = entry.trim();
        if (!trimmed)
            continue;
        const phone = smsRecipient(trimmed);
        const email = phone ? null : usableEmail(trimmed);
        if (!phone && !email)
            continue;
        const key = phone ? `p:${phone}` : `e:${email}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        contacts.push({ name: null, email, phone });
    }
    return contacts;
}
/**
 * The reach figures behind the audience picker.
 *
 * One query for all four sources, counted in a single pass. This previously issued a
 * separate query per source and then a fifth for the union - five scans of the same two
 * tables, with every contact row crossing the wire each time - which is what made the
 * bulk SMS tab slow to open once there were real customers in it.
 */
export async function audienceCounts() {
    // Two minutes. A contact captured moments ago showing up in the picker a little late
    // costs nothing; making every visit wait for a full contact scan costs the operator.
    return cached(AUDIENCE_CACHE_KEY, 120_000, computeAudienceCounts);
}
const AUDIENCE_CACHE_KEY = "messaging:audience";
async function computeAudienceCounts() {
    const rows = await contactRows(new Set(audienceSources), null);
    const tally = (contacts) => ({
        total: contacts.length,
        withPhone: contacts.filter((contact) => contact.phone).length,
        withEmail: contacts.filter((contact) => contact.email).length
    });
    const counts = {};
    for (const source of audienceSources) {
        counts[source] = tally(dedupe(rows.filter((row) => row.src === source)));
    }
    // Deduplicated across sources as well, because one person routinely appears in several.
    counts.ALL = tally(dedupe(rows));
    return counts;
}
export async function emailBrand() {
    const [settings] = await query("SELECT store_name, support_email, whatsapp_phone FROM site_settings WHERE id = 'default' LIMIT 1");
    const brand = await smsBrand();
    return {
        // Email is not billed per character, so it gets the full trading name.
        name: settings?.store_name?.trim() || "Sunspark Electricals & Solar",
        phone: brand.phone,
        website: brand.website,
        supportEmail: settings?.support_email?.trim() || env("SUPPORT_EMAIL", "support@sunsparkelectricals.co.ke")
    };
}
/**
 * Starts a campaign and hands back straight away.
 *
 * A few hundred emails means a few hundred sequential SMTP conversations, which is far
 * longer than the dashboard's request budget. The row is written first and updated as
 * the send proceeds, so the reports tab is the progress indicator rather than a spinner
 * on a request that would have timed out anyway.
 */
export async function startCampaign(input) {
    const manual = manualContacts(input.manual);
    // A pasted list is an explicit instruction and replaces the audience filters entirely.
    const contacts = manual.length ? manual : await resolveAudience({ sources: input.sources, lookbackDays: input.lookbackDays });
    const wantsSms = input.channel !== "EMAIL";
    const wantsEmail = input.channel !== "SMS";
    const phones = wantsSms ? contacts.map((contact) => contact.phone).filter(Boolean) : [];
    const emails = wantsEmail ? contacts.map((contact) => contact.email).filter(Boolean) : [];
    const recipientCount = wantsSms && wantsEmail ? contacts.length : wantsSms ? phones.length : emails.length;
    if (!recipientCount) {
        return { id: null, recipientCount: 0, smsRecipients: 0, emailRecipients: 0, error: "No contact in this audience has the details this channel needs." };
    }
    const audience = manual.length ? "MANUAL" : input.sources.join(",") || "ALL";
    const campaignId = id("cmp");
    await execute(`INSERT INTO message_campaigns (id, name, channel, subject, message, audience, recipient_count, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'SENDING')`, [campaignId, input.name, input.channel, input.subject || null, input.message, audience, recipientCount]);
    void runCampaign(campaignId, input, phones, emails, contacts)
        .catch(async (error) => {
        console.error("Campaign failed", { campaignId, error });
        await execute("UPDATE message_campaigns SET status = 'FAILED', detail = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", [String(error instanceof Error ? error.message : error).slice(0, 255), campaignId]).catch(() => undefined);
    });
    return { id: campaignId, recipientCount, smsRecipients: phones.length, emailRecipients: emails.length, error: null };
}
async function runCampaign(campaignId, input, phones, emails, contacts) {
    let success = 0;
    let failure = 0;
    const notes = [];
    if (phones.length) {
        // MARKETING routes the send through the promotional sender ID. Celcom attaches the
        // opt-out to promotional traffic itself, so nothing is appended here.
        const outcome = await sendComposedSms({ to: phones, body: input.message, purpose: "MARKETING", campaignId });
        success += outcome.sent;
        failure += outcome.failed;
        if (outcome.skipped)
            notes.push(`SMS skipped: ${outcome.skipped}`);
    }
    if (emails.length) {
        const brand = await emailBrand();
        const subject = input.subject.trim() || input.name;
        const content = {
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
            }
            catch (error) {
                failure += 1;
                console.error("Campaign email failed", { campaignId, to, error });
                if (notes.length < 3)
                    notes.push(`${to}: ${error instanceof Error ? error.message : "send failed"}`);
            }
            if (pause > 0)
                await new Promise((resolve) => setTimeout(resolve, pause));
        }
    }
    const skippedContacts = contacts.length - Math.max(phones.length, emails.length);
    if (skippedContacts > 0 && input.channel !== "SMS_AND_EMAIL") {
        notes.push(`${skippedContacts} contact${skippedContacts === 1 ? "" : "s"} had no ${input.channel === "SMS" ? "phone number" : "email address"}.`);
    }
    await execute(`UPDATE message_campaigns
     SET status = ?, success_count = ?, failure_count = ?, detail = ?, finished_at = CURRENT_TIMESTAMP
     WHERE id = ?`, [failure && !success ? "FAILED" : failure ? "PARTIAL" : "SENT", success, failure, notes.join(" ").slice(0, 255) || null, campaignId]);
    // A campaign has just spent credit, so the cached figure is known to be wrong. Dropped
    // rather than left to expire, or the operator would check the balance straight after a
    // send and be shown what it was beforehand.
    if (phones.length)
        invalidate("sms:balance");
}
export async function campaignHistory(limit = 30) {
    const rows = await query("SELECT * FROM message_campaigns ORDER BY created_at DESC LIMIT ?", [Math.min(Math.max(limit, 1), 100)]);
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

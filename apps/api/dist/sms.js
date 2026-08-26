/**
 * Celcom Africa bulk SMS transport.
 *
 * Their API is a plain JSON POST carrying the credentials in the body - no bearer
 * token, no signature - so the key must never reach the browser. Everything here runs
 * on the API service only, and the admin dashboard reads results through it rather
 * than ever holding the credentials itself.
 *
 * Endpoints and field names come from their developer documentation:
 *   send    POST https://isms.celcomafrica.com/api/services/sendsms
 *   dlr     POST https://isms.celcomafrica.com/api/services/getdlr
 *   balance POST https://isms.celcomafrica.com/api/services/getbalance
 *
 * No trailing slash: their documentation shows one, but the live service answers
 * getbalance with an empty body when it is present.
 */
import { execute, query } from "./db.js";
import { env } from "./env.js";
import { id } from "./id.js";
import { composedSms, isTransactional, orderSms, senderIdFor, smsRecipients, smsSegments, toGsm7 } from "./sms-templates.js";
const DEFAULT_SEND_URL = "https://isms.celcomafrica.com/api/services/sendsms";
const DEFAULT_DLR_URL = "https://isms.celcomafrica.com/api/services/getdlr";
const DEFAULT_BALANCE_URL = "https://isms.celcomafrica.com/api/services/getbalance";
export function smsConfiguration() {
    const apiKey = env("CELCOM_SMS_API_KEY").trim();
    const partnerId = env("CELCOM_SMS_PARTNER_ID").trim();
    // One variable per kind of traffic, with no fallback between them and no shared
    // catch-all. Whichever is left empty simply cannot send, which is the point: a
    // shortcode is only ever used for the traffic it was named for. See senderIdFor in
    // ./sms-templates.ts for why borrowing is not offered even as a convenience.
    const transactionalSenderId = env("CELCOM_SMS_SENDER_ID_TRANSACTIONAL").trim();
    const promotionalSenderId = env("CELCOM_SMS_SENDER_ID_PROMOTIONAL").trim();
    // Credentials plus at least one sender ID. A partial configuration would otherwise
    // fail per message with 4091 or 4092 rather than declaring itself unconfigured here.
    if (!apiKey || !partnerId || (!transactionalSenderId && !promotionalSenderId))
        return null;
    return {
        sendUrl: (env("CELCOM_SMS_SEND_URL") || DEFAULT_SEND_URL).trim(),
        dlrUrl: (env("CELCOM_SMS_DLR_URL") || DEFAULT_DLR_URL).trim(),
        balanceUrl: (env("CELCOM_SMS_BALANCE_URL") || DEFAULT_BALANCE_URL).trim(),
        apiKey,
        partnerId,
        transactionalSenderId,
        promotionalSenderId,
        transactionalEnabled: env("CELCOM_SMS_TRANSACTIONAL_ENABLED") !== "false",
        marketingEnabled: env("CELCOM_SMS_MARKETING_ENABLED") !== "false",
        dryRun: env("CELCOM_SMS_DRY_RUN") === "true"
    };
}
/** Celcom's documented return codes, so a failure is reported in words. */
const RETURN_CODES = {
    "200": "Success",
    "1001": "Invalid sender ID - the shortcode is not registered on this account.",
    "1002": "Network not allowed for this account.",
    "1003": "Invalid mobile number.",
    // Documented as "low bulk credits", but the live service also returns it for a number
    // it cannot route to, on accounts with credit to spare.
    "1004": "Invalid or unsupported mobile number (Celcom also uses this code for low credit).",
    "1005": "Celcom system error.",
    "1006": "Invalid credentials - check the API key and partner ID.",
    "1007": "Celcom system error.",
    "1008": "No delivery report available yet.",
    "1009": "Unsupported data type.",
    "1010": "Unsupported request type.",
    "4090": "Celcom internal error - retry after five minutes.",
    "4091": "No partner ID was sent.",
    "4092": "No API key was sent.",
    "4093": "Details not found."
};
export { senderIdFor };
export function describeSmsCode(code) {
    const key = String(code ?? "").trim();
    return RETURN_CODES[key] ?? (key ? `Celcom returned code ${key}.` : "Celcom returned no code.");
}
let brandCache = null;
/**
 * The name, phone number, and website every message signs off with.
 *
 * Read from site settings so the shop can change its number without a deploy, and
 * cached briefly because an order confirmation should not pay for a settings query.
 */
export async function smsBrand() {
    if (brandCache && brandCache.expires > Date.now())
        return brandCache.value;
    let settings;
    try {
        const rows = await query("SELECT store_name, whatsapp_phone FROM site_settings WHERE id = 'default' LIMIT 1");
        settings = rows[0];
    }
    catch (error) {
        console.error("SMS brand lookup failed", error);
    }
    // The full trading name runs to 28 characters, which is a sixth of a segment on every
    // message, so the short form is used unless someone sets one explicitly.
    const name = toGsm7(env("SMS_BRAND_NAME", "Sunspark")).trim() || "Sunspark";
    const phone = (env("SUPPORT_PHONE") || settings?.whatsapp_phone || env("WHATSAPP_PHONE", "")).trim();
    const website = (env("SMS_BRAND_WEBSITE") || env("NEXT_PUBLIC_SITE_URL", "https://sunsparkelectricals.co.ke"))
        .trim()
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/+$/, "");
    const value = { name, phone: localPhone(phone), website };
    brandCache = { value, expires: Date.now() + 60_000 };
    return value;
}
/** 254703586562 reads as a foreign number on a Kenyan handset; 0703586562 does not. */
function localPhone(value) {
    const digits = value.replace(/\D/g, "");
    if (/^254[17]\d{8}$/.test(digits))
        return `0${digits.slice(3)}`;
    if (/^[17]\d{8}$/.test(digits))
        return `0${digits}`;
    return digits;
}
/**
 * Node reports every connection-level failure as the single word "fetch failed" and
 * hides the real reason on `error.cause`. Unwrapping it is the difference between a log
 * line nobody can act on and one that names DNS, TLS, or a refused connection.
 */
function networkReason(error) {
    if (!(error instanceof Error))
        return String(error);
    const cause = error.cause;
    const detail = cause?.code || cause?.message;
    return detail ? `${error.message} (${detail})` : error.message;
}
function chunked(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size)
        chunks.push(values.slice(index, index + size));
    return chunks;
}
/** A connection that never landed is worth one more try; a rejection is not. */
function isTransient(error) {
    if (!(error instanceof Error))
        return false;
    if (error.name === "TimeoutError")
        return true;
    const code = error.cause?.code ?? "";
    return error.message === "fetch failed"
        || ["ENOTFOUND", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(code);
}
async function postJson(url, body, timeoutMs = 15_000) {
    // One retry, because a momentary blip should not silently cost a customer their order
    // confirmation. Anything Celcom actually answered is never retried.
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt)
            await new Promise((resolve) => setTimeout(resolve, 1200));
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs)
            });
            const text = await response.text();
            if (!response.ok)
                throw new Error(`Celcom returned HTTP ${response.status}: ${text.slice(0, 300)}`);
            try {
                return JSON.parse(text);
            }
            catch {
                throw new Error(`Celcom returned a non-JSON response: ${text.slice(0, 300)}`);
            }
        }
        catch (error) {
            lastError = error;
            if (!isTransient(error))
                throw new Error(networkReason(error));
        }
    }
    throw new Error(`${networkReason(lastError)} after 2 attempts`);
}
/**
 * Records what was attempted and what the gateway said.
 *
 * Never allowed to fail a send: the message has already gone out by this point, so a
 * logging problem must not be reported to the caller as a delivery problem.
 */
async function logSmsResults(input) {
    if (!input.results.length)
        return;
    try {
        const channel = isTransactional(input.purpose) ? "TRANSACTIONAL" : "PROMOTIONAL";
        const placeholders = input.results.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values = input.results.flatMap((result) => [
            id("sms"),
            result.recipient.slice(0, 20),
            input.purpose,
            input.senderId.slice(0, 30),
            channel,
            input.message,
            input.segmentsEach,
            result.messageId,
            // "Sent" is all the send call can tell us; delivery is only known from a report.
            input.status ?? (result.ok ? "SENT" : "FAILED"),
            result.code || null,
            result.detail.slice(0, 255),
            input.orderId ?? null,
            input.campaignId ?? null
        ]);
        await execute(`INSERT INTO sms_messages
       (id, recipient, purpose, sender_id, channel, message, segments, provider_message_id, status, response_code, detail, order_id, campaign_id)
       VALUES ${placeholders}`, values);
    }
    catch (error) {
        console.error("SMS log write failed", error);
    }
}
/**
 * Sends one message to one or many recipients.
 *
 * Never throws for a delivery failure: a customer's order must not fail because an SMS
 * gateway is down or out of credit. The caller gets a per-recipient result and decides
 * what, if anything, is worth surfacing.
 */
export async function sendSms(input) {
    const empty = (skipped) => ({ sent: 0, failed: 0, skipped, segments: 0, message: "", results: [] });
    const configuration = smsConfiguration();
    if (!configuration)
        return empty("SMS is not configured.");
    if (isTransactional(input.purpose) && !configuration.transactionalEnabled)
        return empty("Transactional SMS is switched off.");
    if (!isTransactional(input.purpose) && !configuration.marketingEnabled)
        return empty("Promotional SMS is switched off.");
    const senderId = senderIdFor(configuration, input.purpose);
    if (!senderId) {
        return empty(isTransactional(input.purpose)
            ? "No transactional sender ID is configured. Set CELCOM_SMS_SENDER_ID_TRANSACTIONAL in the API environment."
            : "Promotional sending is blocked until a promotional sender ID is set. Add CELCOM_SMS_SENDER_ID_PROMOTIONAL to the API environment - marketing is never sent under the transactional shortcode.");
    }
    const recipients = smsRecipients(Array.isArray(input.to) ? input.to : [input.to]);
    if (!recipients.length)
        return empty("No valid recipient.");
    const message = toGsm7(input.message);
    if (!message)
        return empty("The message was empty once unsupported characters were removed.");
    const segmentsEach = smsSegments(message);
    const segments = segmentsEach * recipients.length;
    if (configuration.dryRun) {
        console.info("SMS dry run", { purpose: input.purpose, recipients: recipients.length, segments, message });
        // Still logged, or a rehearsal would leave nothing to inspect - the point of a dry
        // run is seeing exactly what would have gone out, to whom, at what cost. Marked
        // PENDING rather than SENT, because nothing actually left here.
        const results = recipients.map((recipient) => ({
            recipient,
            ok: false,
            messageId: null,
            code: "",
            detail: "Dry run - composed but not sent to the network."
        }));
        await logSmsResults({ results, message, purpose: input.purpose, senderId, segmentsEach, orderId: input.orderId, campaignId: input.campaignId, status: "PENDING" });
        return { sent: 0, failed: 0, skipped: "Dry run - no message was sent.", segments, message, results: [] };
    }
    try {
        const results = [];
        // Chunked rather than one request per campaign: a promotion to every contact the
        // shop has ever captured is a comma-separated list thousands of numbers long, and a
        // request that size is a good way to be rejected outright. A rejected chunk also
        // costs one chunk rather than the whole send.
        for (const chunk of chunked(recipients, 100)) {
            const body = await postJson(configuration.sendUrl, {
                apikey: configuration.apiKey,
                partnerID: configuration.partnerId,
                shortcode: senderId,
                // Their API takes a comma-separated list for a bulk send.
                mobile: chunk.join(","),
                message,
                pass_type: "plain"
            });
            const rows = Array.isArray(body?.responses) ? body.responses : [];
            // A response with no rows at all is a failure, not a silent success.
            if (!rows.length) {
                results.push(...chunk.map((recipient) => ({ recipient, ok: false, messageId: null, code: "", detail: "Celcom returned no per-message response." })));
                continue;
            }
            results.push(...rows.map((row, index) => {
                const code = String(row["respose-code"] ?? row["response-code"] ?? "").trim();
                return {
                    recipient: String(row.mobile ?? chunk[index] ?? ""),
                    ok: code === "200",
                    messageId: row.messageid === undefined || row.messageid === null ? null : String(row.messageid),
                    code,
                    detail: row["response-description"] || describeSmsCode(code)
                };
            }));
        }
        await logSmsResults({ results, message, purpose: input.purpose, senderId, segmentsEach, orderId: input.orderId, campaignId: input.campaignId });
        const sent = results.filter((result) => result.ok).length;
        return { sent, failed: results.length - sent, skipped: null, segments, message, results };
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : "The SMS gateway could not be reached.";
        console.error("SMS send failed", { purpose: input.purpose, recipients: recipients.length, detail });
        const failures = recipients.map((recipient) => ({ recipient, ok: false, messageId: null, code: "", detail }));
        await logSmsResults({ results: failures, message, purpose: input.purpose, senderId, segmentsEach, orderId: input.orderId, campaignId: input.campaignId });
        return { sent: 0, failed: recipients.length, skipped: null, segments, message, results: failures };
    }
}
/**
 * The transactional message for an order event, sent without holding up the response.
 *
 * Fire-and-forget by design: a customer waiting on a checkout confirmation should not
 * also wait on Celcom, and an SMS failure must never roll back a paid sale.
 */
export function queueOrderSms(purpose, context) {
    if (!context.phone)
        return;
    void (async () => {
        const brand = await smsBrand();
        const outcome = await sendSms({
            to: context.phone,
            message: orderSms(purpose, brand, context),
            purpose,
            orderId: context.orderId ?? null
        });
        if (outcome.skipped)
            console.warn("Order SMS skipped", { purpose, orderNumber: context.orderNumber, reason: outcome.skipped });
    })().catch((error) => console.error("Order SMS failed", { purpose, orderNumber: context.orderNumber, error }));
}
/** An admin-composed message, signed off with the shop's number and website. */
export async function sendComposedSms(input) {
    const brand = await smsBrand();
    return sendSms({ to: input.to, message: composedSms(input.body, brand), purpose: input.purpose, campaignId: input.campaignId ?? null });
}
export async function smsDeliveryReport(messageId) {
    const configuration = smsConfiguration();
    if (!configuration)
        return null;
    try {
        return await postJson(configuration.dlrUrl, {
            apikey: configuration.apiKey,
            partnerID: configuration.partnerId,
            messageID: messageId
        });
    }
    catch (error) {
        console.error("SMS delivery report failed", { messageId, error });
        return null;
    }
}
/**
 * Remaining SMS credit.
 *
 * Worth surfacing in admin: running out means the shop has silently stopped being able
 * to notify anyone, and nothing else in the system would reveal that.
 */
export async function smsBalance() {
    const configuration = smsConfiguration();
    if (!configuration)
        return null;
    try {
        return await postJson(configuration.balanceUrl, {
            apikey: configuration.apiKey,
            partnerID: configuration.partnerId
        });
    }
    catch (error) {
        console.error("SMS balance check failed", { error });
        return null;
    }
}
export function smsConfigurationSummary() {
    const configuration = smsConfiguration();
    return {
        configured: Boolean(configuration),
        // Surfaced separately because the SMS system can be fully working for orders while
        // campaigns remain deliberately blocked.
        promotionalReady: Boolean(configuration?.promotionalSenderId),
        transactionalSenderId: configuration?.transactionalSenderId || null,
        promotionalSenderId: configuration?.promotionalSenderId || null,
        transactionalEnabled: configuration?.transactionalEnabled ?? false,
        marketingEnabled: configuration?.marketingEnabled ?? false,
        dryRun: configuration?.dryRun ?? false
    };
}
/** Where an administrator goes to buy more credit. */
export function smsTopUpUrl() {
    return env("CELCOM_SMS_TOPUP_URL", "https://celcomafrica.com").trim();
}
/** Recent traffic plus the counts a shop actually acts on. */
export async function smsReport(limit = 200) {
    const capped = Math.min(Math.max(limit, 1), 500);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [rows, byStatus, byChannel] = await Promise.all([
        query("SELECT * FROM sms_messages ORDER BY created_at DESC LIMIT ?", [capped]),
        query("SELECT status, COUNT(*) AS count FROM sms_messages WHERE created_at >= ? GROUP BY status", [since]),
        // Segments, not messages: a long message is billed more than once, so this is what
        // actually draws the credit balance down.
        query("SELECT channel, COALESCE(SUM(segments), 0) AS segments FROM sms_messages WHERE created_at >= ? GROUP BY channel", [since])
    ]);
    return {
        messages: rows.map((row) => ({
            id: row.id,
            recipient: row.recipient,
            purpose: row.purpose,
            senderId: row.sender_id,
            channel: row.channel,
            message: row.message,
            segments: Number(row.segments ?? 0),
            providerMessageId: row.provider_message_id,
            status: row.status,
            responseCode: row.response_code,
            detail: row.detail,
            orderId: row.order_id,
            campaignId: row.campaign_id,
            createdAt: row.created_at
        })),
        last30Days: {
            byStatus: Object.fromEntries(byStatus.map((row) => [row.status, Number(row.count ?? 0)])),
            segmentsByChannel: Object.fromEntries(byChannel.map((row) => [row.channel, Number(row.segments ?? 0)]))
        }
    };
}
/**
 * The figures behind the dashboard's SMS card.
 *
 * Deliberately does not call Celcom. The dashboard loads on every admin visit, and a
 * balance lookup per page view would be a round trip nobody asked for; the balance lives
 * on the bulk SMS tab, behind an intentional visit.
 */
export async function smsDashboardSummary() {
    const configuration = smsConfiguration();
    try {
        // Not aliased "window": that is a reserved word in MariaDB and MySQL 8, and the
        // resulting parse error was being swallowed by the catch below, so the dashboard
        // quietly reported zero traffic while the reports page counted it correctly.
        const rows = await query(`SELECT
         CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 'week' ELSE 'month' END AS bucket,
         COUNT(*) AS messages,
         COALESCE(SUM(segments), 0) AS segments,
         COUNT(CASE WHEN status IN ('FAILED', 'UNDELIVERED') THEN 1 END) AS failed
       FROM sms_messages
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY bucket`);
        const week = rows.find((row) => row.bucket === "week");
        const total = (key) => rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
        return {
            configured: Boolean(configuration),
            promotionalReady: Boolean(configuration?.promotionalSenderId),
            dryRun: configuration?.dryRun ?? false,
            messages7Days: Number(week?.messages ?? 0),
            segments7Days: Number(week?.segments ?? 0),
            messages30Days: total("messages"),
            segments30Days: total("segments"),
            failed30Days: total("failed")
        };
    }
    catch (error) {
        console.error("SMS dashboard summary failed", error);
        return {
            configured: Boolean(configuration),
            promotionalReady: Boolean(configuration?.promotionalSenderId),
            dryRun: configuration?.dryRun ?? false,
            messages7Days: 0,
            segments7Days: 0,
            messages30Days: 0,
            segments30Days: 0,
            failed30Days: 0
        };
    }
}
/**
 * Asks Celcom what happened to messages still marked as merely sent.
 *
 * Capped per run, and triggered by hand rather than on page load, so a backlog cannot
 * turn one admin visit into hundreds of calls.
 */
export async function refreshSmsDeliveryReports(limit = 25) {
    if (!smsConfiguration())
        return { checked: 0, updated: 0 };
    const pending = await query(`SELECT id, provider_message_id FROM sms_messages
     WHERE status IN ('SENT', 'PENDING') AND provider_message_id IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`, [Math.min(Math.max(limit, 1), 100)]);
    let updated = 0;
    for (const row of pending) {
        const report = await smsDeliveryReport(row.provider_message_id);
        const text = JSON.stringify(report ?? {}).toLowerCase();
        // Their delivery payload is not documented field by field, so the status is read
        // from the words it contains rather than a shape that might not hold.
        const status = /deliver(ed)?"|"delivrd|"success/.test(text) && !/undeliver/.test(text)
            ? "DELIVERED"
            : /undeliver|failed|expired|reject/.test(text)
                ? "UNDELIVERED"
                : null;
        await execute(`UPDATE sms_messages
       SET status = COALESCE(?, status),
           detail = COALESCE(?, detail),
           delivered_at = COALESCE(?, delivered_at),
           last_checked_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [status, report ? JSON.stringify(report).slice(0, 255) : null, status === "DELIVERED" ? new Date() : null, row.id]);
        if (status)
            updated += 1;
    }
    return { checked: pending.length, updated };
}

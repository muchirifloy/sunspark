/**
 * SMS composition: recipient normalising, GSM-7 safety, segment counting, and the
 * exact wording of every message Sunspark sends.
 *
 * Pure functions only, with no database or network access, so the text that will reach
 * a customer can be reasoned about (and tested) without a Celcom account or a balance.
 * The transport that actually delivers these lives in ./sms.ts.
 */

export const smsPurposes = [
  "ORDER_RECEIVED",
  "ORDER_PROCESSING",
  "ORDER_COMPLETED",
  "WALK_IN_SALE",
  "CUSTOMER_SERVICE",
  "MARKETING"
] as const;

export type SmsPurpose = (typeof smsPurposes)[number];

/**
 * Transactional traffic must still go out when promotions are paused, and a promotion
 * must never ride on the transactional sender ID - that is what gets a shortcode
 * revoked. Deriving the split from the purpose stops one becoming the other by
 * accident, and stops it being a choice anyone can get wrong in the admin.
 */
export function isTransactional(purpose: SmsPurpose) {
  return purpose !== "MARKETING";
}

export type SenderIds = {
  transactionalSenderId: string;
  promotionalSenderId: string;
};

/**
 * Which shortcode a message goes out under, decided from the purpose alone.
 *
 * Each kind of traffic reads exactly one shortcode and never borrows the other, in
 * either direction. Borrowing is how marketing ends up under a transactional sender ID,
 * which is what gets that ID revoked - and losing it would take the order confirmations
 * down with it. An unset shortcode therefore means that kind of message is refused, and
 * the caller is told which variable would fix it.
 *
 * The consequence is that naming a shortcode is always a deliberate act. Nothing is ever
 * sent under an ID that merely happened to be configured for something else.
 */
export function senderIdFor(senderIds: SenderIds, purpose: SmsPurpose) {
  return isTransactional(purpose) ? senderIds.transactionalSenderId : senderIds.promotionalSenderId;
}

/**
 * A number in the 254XXXXXXXXX form Celcom expects, or null.
 *
 * Non-throwing on purpose: one malformed number in a bulk list should drop that
 * recipient, not abandon the whole send.
 */
export function smsRecipient(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

/** Valid recipients, deduplicated, in the order they were given. */
export function smsRecipients(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  for (const value of values) {
    const recipient = smsRecipient(value);
    if (recipient) seen.add(recipient);
  }
  return [...seen];
}

// The GSM 03.38 basic set. Anything outside it forces the whole message into UCS-2,
// which cuts the per-segment allowance from 160 characters to 70.
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// These are legal but cost two characters each rather than one.
const GSM7_EXTENDED = "^{}\\[~]|€";

// Characters a phone keyboard or a copy-paste routinely introduces, each of which would
// otherwise silently halve the segment length.
const SUBSTITUTIONS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "−": "-",
  "…": "...", " ": " ", "•": "-", "·": "-",
  "×": "x", "™": "TM", "®": "", "©": "",
  "ʼ": "'", "‹": "<", "›": ">"
};

/**
 * Rewrites a message into characters Celcom will accept, dropping anything with no
 * GSM-7 equivalent rather than letting one emoji double the cost of the whole send.
 */
export function toGsm7(message: string) {
  let out = "";
  for (const character of message.replace(/\r\n/g, "\n")) {
    const mapped = SUBSTITUTIONS[character] ?? character;
    for (const candidate of mapped) {
      if (GSM7_BASIC.includes(candidate) || GSM7_EXTENDED.includes(candidate)) out += candidate;
    }
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

/** Billable length: extended characters count twice. */
export function gsm7Length(message: string) {
  let length = 0;
  for (const character of message) length += GSM7_EXTENDED.includes(character) ? 2 : 1;
  return length;
}

/** How many messages the account is charged for. */
export function smsSegments(message: string) {
  const length = gsm7Length(message);
  if (length === 0) return 0;
  if (length <= 160) return 1;
  // Concatenated parts each surrender 7 characters to the joining header.
  return Math.ceil(length / 153);
}

export type SmsBrand = {
  /** Short trading name. Kept brief because every character is billed. */
  name: string;
  /** The number a customer should call back on. */
  phone: string;
  /** Bare host, no protocol - "https://" would cost eight characters per message. */
  website: string;
};

export type OrderSmsContext = {
  orderNumber?: string | null;
  customerName?: string | null;
  totalCents?: number | null;
};

// Counter sales are recorded against a placeholder when nobody gave a name. Greeting
// someone as "Hi Walk-in" reads as careless, so these count as no name at all.
const PLACEHOLDER_NAMES = new Set(["walk", "walkin", "walk-in", "customer", "guest", "client", "cash", "n/a", "na", "unknown", "anonymous"]);

function firstName(value: string | null | undefined) {
  const trimmed = toGsm7(String(value ?? "")).trim();
  if (PLACEHOLDER_NAMES.has(trimmed.toLowerCase().replace(/\s+customer$/, ""))) return "";
  const name = trimmed.split(/\s+/)[0] ?? "";
  if (name.length < 2 || PLACEHOLDER_NAMES.has(name.toLowerCase())) return "";
  return name;
}

/** "Hi Grace, " when there is a real name, "Hi there, " when there is not. */
function greeting(value: string | null | undefined) {
  const name = firstName(value);
  return name ? `Hi ${name}, ` : "Hi there, ";
}

/**
 * The courtesy tail every message carries.
 *
 * An SMS from an unregistered sender ID arrives as a bare number, so without this a
 * customer has no way to tell who texted them or how to reply.
 */
export function smsSignature(brand: SmsBrand) {
  // Joined with a full stop rather than a pipe: "|" is a GSM-7 extended character and is
  // billed as two, which is a wasted character on every message the shop ever sends.
  const parts = [brand.phone ? `Call ${brand.phone}` : "", brand.website].filter(Boolean);
  return parts.length ? ` ${parts.join(". ")}` : "";
}

function money(cents: number | null | undefined) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return `KES ${Math.round(cents / 100).toLocaleString("en-KE")}`;
}

/**
 * The wording of each transactional message.
 *
 * Deliberately short. Every one names the business, says what happened, and ends with
 * the phone number and website, and every one stays inside a single 160-character
 * segment at typical order numbers and names.
 */
export function orderSms(purpose: SmsPurpose, brand: SmsBrand, context: OrderSmsContext) {
  const hello = greeting(context.customerName);
  const tail = smsSignature(brand);
  const reference = context.orderNumber ? ` ${context.orderNumber}` : "";
  const paid = money(context.totalCents);

  switch (purpose) {
    case "ORDER_RECEIVED":
      return toGsm7(`${hello}${brand.name} has received your order${reference}. We will confirm it shortly. Thank you.${tail}`);
    case "ORDER_PROCESSING":
      return toGsm7(`${hello}your ${brand.name} order${reference} is being processed. We will let you know when it is ready.${tail}`);
    case "ORDER_COMPLETED":
      return toGsm7(`${hello}your ${brand.name} order${reference} is complete. Thank you for your business.${tail}`);
    // The counter sale is already paid and already handed over, so this confirms rather
    // than promises: nothing further is going to happen that the customer must wait for.
    case "WALK_IN_SALE":
      return toGsm7(`${hello}thank you for shopping at ${brand.name}.${paid ? ` Payment of ${paid} received.` : ""} Keep this as your receipt.${tail}`);
    default:
      return toGsm7(`${brand.name}: your order${reference} has been updated.${tail}`);
  }
}

/**
 * An admin-composed message.
 *
 * The signature is appended unless the writer already included the site address, so a
 * hand-written message never arrives unattributable and never repeats itself.
 */
export function composedSms(body: string, brand: SmsBrand) {
  const message = toGsm7(body);
  if (!message) return "";
  const tail = smsSignature(brand);
  const alreadySigned = Boolean(brand.website) && message.toLowerCase().includes(brand.website.toLowerCase());
  return alreadySigned || !tail ? message : `${message}${tail}`;
}

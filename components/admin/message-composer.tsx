"use client";

import { useMemo, useState } from "react";
import { droppedCharacters, gsm7Length, isKenyanMobile, smsSegments, toGsm7 } from "@/lib/sms/gsm7";

export type AudienceCount = { total: number; withPhone: number; withEmail: number };
export type AudienceCounts = Record<string, AudienceCount>;

export type ComposerMode = "bulk-sms" | "bulk-email" | "single";

const audienceOptions = [
  { value: "ORDER_CUSTOMERS", label: "Online orders", hint: "Anyone who has checked out on the site or through WhatsApp" },
  { value: "WALK_IN_CUSTOMERS", label: "Walk-in sales", hint: "Counter customers who left a number" },
  { value: "REGISTERED_CUSTOMERS", label: "Registered accounts", hint: "Customers who created an account" },
  { value: "QUOTE_CONTACTS", label: "Quotes & invoices", hint: "Contacts captured on a quotation or draft invoice" }
] as const;

const lookbackOptions = [
  { value: 0, label: "All time" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 3 months" },
  { value: 365, label: "Last year" }
];

/**
 * The three send forms.
 *
 * One component rather than three, because the part that matters - showing the operator
 * what a send will cost before they commit to it - is identical in all of them, and the
 * cost estimate is the whole reason this is a client component.
 */
export function MessageComposer({
  action,
  audience,
  mode,
  promotionalReady,
  signature,
  smsConfigured,
  website
}: {
  action: (formData: FormData) => void;
  audience: AudienceCounts;
  mode: ComposerMode;
  /** A promotional shortcode is configured, so marketing may be sent. */
  promotionalReady: boolean;
  signature: string;
  smsConfigured: boolean;
  website: string;
}) {
  const isEmail = mode === "bulk-email";
  const isSingle = mode === "single";

  const [message, setMessage] = useState("");
  const [to, setTo] = useState("");
  const [manual, setManual] = useState("");
  const [sources, setSources] = useState<string[]>(isEmail ? ["ORDER_CUSTOMERS"] : ["ORDER_CUSTOMERS", "WALK_IN_CUSTOMERS"]);

  // The server appends the shop's number and website unless the writer already put the
  // site in the text, so the preview has to apply the same rule to be honest about cost.
  const composed = useMemo(() => {
    // The pending trailing space is kept so the counter moves once per keystroke; see
    // toGsm7. HTML collapses it, so the preview below reads exactly as it will send.
    const body = toGsm7(message, { preserveTrailingSpace: true });
    if (!body) return "";
    const signed = website && body.toLowerCase().includes(website.toLowerCase());
    return signed || !signature ? body : `${body}${signature}`;
  }, [message, signature, website]);

  // Billable length, not string length: "|", "€" and the other GSM-7 extended
  // characters are charged as two, so counting them as one would understate the cost.
  const characters = gsm7Length(composed);
  const segments = smsSegments(composed);
  const dropped = useMemo(() => droppedCharacters(message), [message]);

  const manualRecipients = useMemo(
    () => manual.split(/[\s,;]+/).map((entry) => entry.trim()).filter(Boolean),
    [manual]
  );

  // A pasted list is an explicit instruction and replaces the audience filters, which is
  // the same precedence the API applies.
  const reach = useMemo(() => {
    if (manualRecipients.length) return manualRecipients.filter((entry) => (isEmail ? entry.includes("@") : isKenyanMobile(entry))).length;
    if (!sources.length) return 0;
    // Sources overlap - the same person orders online and walks in - so the sum is an
    // upper bound and is labelled as one rather than presented as a headcount.
    return sources.reduce((total, source) => total + (isEmail ? audience[source]?.withEmail ?? 0 : audience[source]?.withPhone ?? 0), 0);
  }, [audience, isEmail, manualRecipients, sources]);

  const cap = audience.ALL ? (isEmail ? audience.ALL.withEmail : audience.ALL.withPhone) : reach;
  const estimatedReach = manualRecipients.length ? reach : Math.min(reach, cap);

  // Every bulk SMS send is marketing by definition, so it needs the promotional
  // shortcode. A single customer-service text does not.
  const blockedForPromotional = mode === "bulk-sms" && smsConfigured && !promotionalReady;

  function toggleSource(value: string) {
    setSources((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]));
  }

  return (
    <form action={action} className="admin-form sms-composer">
      <input name="channel" type="hidden" value={isEmail ? "EMAIL" : "SMS"} />

      {isSingle ? (
        <>
          <label>
            Phone number
            <input
              inputMode="tel"
              name="to"
              onChange={(event) => setTo(event.target.value)}
              placeholder="0712345678"
              required
              value={to}
            />
          </label>
          {to && !isKenyanMobile(to) ? <p className="sms-warning">That is not a Kenyan mobile number. Use 07.., 01.. or 2547...</p> : null}
          <label>
            Message type
            <select defaultValue="CUSTOMER_SERVICE" name="purpose">
              <option value="CUSTOMER_SERVICE">Customer service — goes out on the transactional sender ID</option>
              <option disabled={!promotionalReady} value="MARKETING">
                Promotional — goes out on the promotional sender ID{promotionalReady ? "" : " (not configured)"}
              </option>
            </select>
          </label>
        </>
      ) : (
        <label>
          Campaign name
          <input name="name" placeholder="September solar offer" required />
        </label>
      )}

      {isEmail ? (
        <>
          <label>
            Subject
            <input name="subject" placeholder="Save on solar this September" required />
          </label>
          <label>
            Heading <small>Optional. The large line at the top of the email; defaults to the subject.</small>
            <input name="heading" placeholder="September solar offer" />
          </label>
        </>
      ) : null}

      <label>
        Message
        <textarea
          name="message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder={isEmail ? "Write the email. Leave a blank line between paragraphs." : "Keep it short. The shop number and website are added automatically."}
          required
          rows={isEmail ? 10 : 5}
          value={message}
        />
      </label>

      {isEmail ? (
        <div className="sms-field-row">
          <label>
            Button label <small>Optional</small>
            <input name="buttonLabel" placeholder="Shop the offer" />
          </label>
          <label>
            Button link
            <input name="buttonUrl" placeholder="https://sunsparkelectricals.co.ke/store" type="url" />
          </label>
        </div>
      ) : (
        <div className="sms-meter" aria-live="polite">
          <span><strong>{characters}</strong> of {segments <= 1 ? 160 : segments * 153} characters</span>
          <span><strong>{segments}</strong> segment{segments === 1 ? "" : "s"} per recipient</span>
          {signature ? <span className="sms-meter-note">Signed off with{signature}</span> : null}
        </div>
      )}

      {!isEmail && composed ? <p className="sms-preview"><span>Preview</span>{composed}</p> : null}
      {!isEmail && dropped.length ? (
        <p className="sms-warning">
          These characters cannot be sent by SMS and will be removed: {dropped.join(" ")}
        </p>
      ) : null}

      {!isSingle ? (
        <fieldset className="sms-audience">
          <legend>Who receives this</legend>
          {audienceOptions.map((option) => {
            const counts = audience[option.value];
            const reachable = isEmail ? counts?.withEmail ?? 0 : counts?.withPhone ?? 0;
            return (
              <label className="sms-audience-option" key={option.value}>
                <input
                  checked={sources.includes(option.value)}
                  name="sources"
                  onChange={() => toggleSource(option.value)}
                  type="checkbox"
                  value={option.value}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
                <b>{reachable}</b>
              </label>
            );
          })}
          <label className="sms-lookback">
            Only contacts from
            <select defaultValue={0} name="lookbackDays">
              {lookbackOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Or send to specific {isEmail ? "addresses" : "numbers"} <small>Overrides the selection above. Separate with spaces, commas, or new lines.</small>
            <textarea
              name="manual"
              onChange={(event) => setManual(event.target.value)}
              placeholder={isEmail ? "jane@example.com, peter@example.com" : "0712345678, 0798765432"}
              rows={3}
              value={manual}
            />
          </label>
        </fieldset>
      ) : null}

      {!isSingle ? (
        <div className="sms-estimate" aria-live="polite">
          <div>
            <span>Recipients</span>
            <strong>{manualRecipients.length ? estimatedReach : `up to ${estimatedReach}`}</strong>
            <small>{manualRecipients.length ? "From the list you pasted" : "Contacts overlap between sources, so duplicates are removed before sending"}</small>
          </div>
          {!isEmail ? (
            <div>
              <span>Credits</span>
              <strong>{segments * estimatedReach || 0}</strong>
              <small>{segments} segment{segments === 1 ? "" : "s"} x {estimatedReach} recipient{estimatedReach === 1 ? "" : "s"}</small>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isEmail && !smsConfigured ? (
        <p className="sms-warning">SMS is not configured, so nothing will be sent. Add the Celcom credentials to the API environment first.</p>
      ) : null}
      {blockedForPromotional ? (
        <p className="sms-warning">
          Bulk SMS is blocked until a promotional sender ID is configured. Marketing is never sent under the
          transactional shortcode, so this is refused rather than quietly rerouted. Order texts are unaffected.
        </p>
      ) : null}

      <button className="primary-btn" disabled={(!isEmail && !smsConfigured) || blockedForPromotional} type="submit">
        {isSingle ? "Send message" : isEmail ? "Send bulk email" : "Send bulk SMS"}
      </button>
    </form>
  );
}

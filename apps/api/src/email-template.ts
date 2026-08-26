/**
 * The branded HTML shell every customer-facing bulk email is poured into.
 *
 * Written as nested tables with inline styles rather than modern CSS, because Outlook
 * and Gmail's clipper still discard `<style>` blocks, flexbox, and grid. The result
 * looks the same in a desktop client, a webmail preview pane, and a phone, which a
 * stylesheet-driven layout would not.
 */

const BRAND_COLOR = "#0f65c8";
const INK = "#172033";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const CANVAS = "#f1f5f9";

export function htmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Plain typed text into paragraphs.
 *
 * Everything is escaped first: the composer is a plain textarea, so an ampersand in
 * "Solar & Electrical" is a literal, not the start of an entity, and a pasted angle
 * bracket must never open a tag.
 */
export function paragraphs(body: string) {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${INK}">${htmlEscape(block).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

/** The text/plain alternative. A mail client that shows this must still make sense. */
export function plainText(input: { heading?: string; body: string; buttonLabel?: string; buttonUrl?: string; brand: EmailBrand }) {
  return [
    input.heading ?? "",
    "",
    input.body.trim(),
    input.buttonLabel && input.buttonUrl ? `\n${input.buttonLabel}: ${input.buttonUrl}` : "",
    "",
    "--",
    input.brand.name,
    input.brand.phone ? `Call or WhatsApp: ${input.brand.phone}` : "",
    input.brand.website,
    input.brand.supportEmail
  ].filter((line) => line !== "").join("\n");
}

export type EmailBrand = {
  name: string;
  phone: string;
  /** Bare host, used as the visible link text. */
  website: string;
  supportEmail: string;
};

export type EmailContent = {
  /** Large line at the top of the white card. Falls back to the subject. */
  heading?: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  /** Small print under the footer rule, for a promotional notice or an address. */
  footerNote?: string;
};

/**
 * Wraps composed content in the Sunspark shell.
 *
 * The preheader is the grey line a phone shows next to the subject in the inbox list;
 * without one, clients pull the first words of the header markup instead.
 */
export function campaignEmailHtml(subject: string, content: EmailContent, brand: EmailBrand) {
  const heading = (content.heading ?? subject).trim();
  const preheader = content.body.replace(/\s+/g, " ").trim().slice(0, 140);
  const siteUrl = `https://${brand.website}`;
  const button = content.buttonLabel && content.buttonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
         <tr>
           <td align="center" bgcolor="${BRAND_COLOR}" style="border-radius:8px">
             <a href="${htmlEscape(content.buttonUrl)}" style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${htmlEscape(content.buttonLabel)}</a>
           </td>
         </tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${htmlEscape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${htmlEscape(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CANVAS};padding:24px 12px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER}">
        <tr>
          <td style="background:${BRAND_COLOR};padding:22px 28px">
            <a href="${siteUrl}" style="font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:.3px">${htmlEscape(brand.name)}</a>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#d8e8fb;padding-top:4px">Electrical &amp; solar supplies</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 8px;font-family:Arial,Helvetica,sans-serif">
            ${heading ? `<h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;color:${INK}">${htmlEscape(heading)}</h1>` : ""}
            ${paragraphs(content.body)}
            ${button}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px 26px">
            <div style="border-top:1px solid ${BORDER};padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${MUTED}">
              <strong style="color:${INK}">${htmlEscape(brand.name)}</strong><br>
              ${brand.phone ? `Call or WhatsApp: <a href="tel:${htmlEscape(brand.phone.replace(/\s+/g, ""))}" style="color:${BRAND_COLOR};text-decoration:none">${htmlEscape(brand.phone)}</a><br>` : ""}
              <a href="${siteUrl}" style="color:${BRAND_COLOR};text-decoration:none">${htmlEscape(brand.website)}</a>
              &nbsp;&middot;&nbsp;
              <a href="mailto:${htmlEscape(brand.supportEmail)}" style="color:${BRAND_COLOR};text-decoration:none">${htmlEscape(brand.supportEmail)}</a>
              ${content.footerNote ? `<div style="padding-top:12px;font-size:12px;color:${MUTED}">${htmlEscape(content.footerNote)}</div>` : ""}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

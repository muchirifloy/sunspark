/**
 * Client-side twin of the segment counting in apps/api/src/sms-templates.ts.
 *
 * Duplicated rather than imported because the API compiles from its own rootDir and
 * cannot be reached from the app bundle - the same split the two copies of the SMTP
 * client already live on. The API stays authoritative: this exists so the composer can
 * show a live character and segment count as somebody types, without a round trip per
 * keystroke.
 */

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

const SUBSTITUTIONS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "−": "-",
  "…": "...", " ": " ", "•": "-", "·": "-",
  "×": "x", "™": "TM", "®": "", "©": "",
  "ʼ": "'", "‹": "<", "›": ">"
};

/**
 * `preserveTrailingSpace` exists for the live counter only.
 *
 * The server trims what it sends, and so does this by default. But a counter that trims
 * as you type stalls on the space after a word and then jumps by two on the next letter,
 * which reads as a broken count rather than as a trim. Keeping the pending space makes
 * the number move once per keystroke; it is at most one character above what is billed,
 * and only while a trailing space is sitting there unfinished.
 */
export function toGsm7(message: string, { preserveTrailingSpace = false } = {}) {
  let out = "";
  for (const character of message.replace(/\r\n/g, "\n")) {
    const mapped = SUBSTITUTIONS[character] ?? character;
    for (const candidate of mapped) {
      if (GSM7_BASIC.includes(candidate) || GSM7_EXTENDED.includes(candidate)) out += candidate;
    }
  }
  const collapsed = out.replace(/[ \t]+/g, " ");
  return preserveTrailingSpace ? collapsed.replace(/^[ \n]+/, "") : collapsed.trim();
}

export function gsm7Length(message: string) {
  let length = 0;
  for (const character of message) length += GSM7_EXTENDED.includes(character) ? 2 : 1;
  return length;
}

export function smsSegments(message: string) {
  const length = gsm7Length(message);
  if (length === 0) return 0;
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}

/** Characters the sender typed that will not survive the trip to the handset. */
export function droppedCharacters(message: string) {
  const kept = new Set(toGsm7(message));
  const dropped = new Set<string>();
  for (const character of message) {
    if (character.trim() && !kept.has(character) && !SUBSTITUTIONS[character]) dropped.add(character);
  }
  return [...dropped];
}

export function isKenyanMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^254[17]\d{8}$/.test(digits) || /^0[17]\d{8}$/.test(digits) || /^[17]\d{8}$/.test(digits);
}

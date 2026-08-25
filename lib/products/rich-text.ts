import sanitizeHtml from "sanitize-html";

/**
 * Inline styling is allowed, but only these properties and only these value
 * shapes. `style` is never accepted as free text: sanitize-html drops any
 * declaration whose property is not listed here or whose value fails the regex,
 * so nothing like `url(...)`, `expression(...)` or a positioning override can
 * reach the storefront. Colours are restricted to hex and rgb/rgba, sizes and
 * spacing to plain numbers with a known unit.
 */
const allowedInlineStyles: Record<string, RegExp[]> = {
  color: [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i],
  "background-color": [/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i, /^transparent$/i],
  // Capped well below anything that could be used to cover surrounding page UI.
  "font-size": [/^(?:[0-9]|[1-6][0-9]|7[0-2])(?:\.\d+)?px$/, /^[0-4](?:\.\d+)?rem$/, /^(?:[5-9][0-9]|1[0-9][0-9]|200)%$/],
  "text-align": [/^(?:left|right|center|justify)$/],
  "line-height": [/^[0-3](?:\.\d+)?$/]
};

const richTextOptions: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "span", "ul", "ol", "li", "a", "h2", "h3", "blockquote"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    span: ["style"],
    p: ["style"],
    h2: ["style"],
    h3: ["style"],
    li: ["style"],
    blockquote: ["style"]
  },
  allowedStyles: { "*": allowedInlineStyles },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: (_tagName, attributes) => ({
      tagName: "a",
      attribs: { ...attributes, rel: "noopener noreferrer", target: "_blank" },
    }),
  },
};

/**
 * Rewrites the block wrappers a contentEditable produces into paragraphs.
 *
 * Pressing Enter in the admin editor emits <div> in Chrome and Safari. Those
 * tags are not on the allow list, and sanitize-html drops a disallowed tag while
 * keeping its text, so every paragraph an admin typed used to arrive at the
 * storefront concatenated into a single run-on line.
 *
 * This only rewrites div wrappers; the result is still sanitized afterwards, so
 * it cannot be used to smuggle markup past the allow list.
 */
function paragraphsFromBlocks(input: string) {
  let output = input.replace(/<div\b[^>]*>/gi, "<p>").replace(/<\/div\s*>/gi, "</p>");

  // Nested wrappers would otherwise become nested paragraphs, which is invalid.
  let previous: string;
  do {
    previous = output;
    output = output.replace(/<p>\s*<p>/gi, "<p>").replace(/<\/p>\s*<\/p>/gi, "</p>");
  } while (output !== previous);

  return output;
}

/**
 * Editors leave behind empty blocks - a trailing paragraph after the last list,
 * or a paragraph holding nothing but a line break. They render as stray gaps on
 * the product page and accumulate with every save.
 */
function dropEmptyParagraphs(html: string) {
  return html.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "");
}

export function sanitizeRichText(value: string | null | undefined) {
  const input = String(value ?? "").trim();
  if (!input) return "";

  if (!/<[a-z][\s\S]*>/i.test(input)) {
    const plain = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
    return plain
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
      .join("");
  }

  return dropEmptyParagraphs(sanitizeHtml(paragraphsFromBlocks(input), richTextOptions));
}

export function richTextToPlainText(value: string | null | undefined) {
  return sanitizeHtml(String(value ?? ""), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeProductDescriptions(
  shortDescription: string | null | undefined,
  description: string | null | undefined,
) {
  const shortHtml = sanitizeRichText(shortDescription);
  const fullHtml = sanitizeRichText(description);
  const shortText = richTextToPlainText(shortHtml).toLocaleLowerCase();
  const fullText = richTextToPlainText(fullHtml).toLocaleLowerCase();

  if (!shortHtml || (shortText && fullText.includes(shortText))) return fullHtml;
  return `${shortHtml}${fullHtml}`;
}

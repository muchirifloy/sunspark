import sanitizeHtml from "sanitize-html";

const richTextOptions: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h2", "h3", "blockquote"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: (_tagName, attributes) => ({
      tagName: "a",
      attribs: { ...attributes, rel: "noopener noreferrer", target: "_blank" },
    }),
  },
};

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

  return sanitizeHtml(input, richTextOptions);
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

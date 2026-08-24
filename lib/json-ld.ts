const htmlEscapes: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026"
};

/**
 * Serialises structured data for an inline <script type="application/ld+json">.
 *
 * JSON.stringify does not escape "<", so a product name or description
 * containing "</script>" would otherwise close the tag early and let the rest of
 * the value run as markup. Replacing the HTML-significant characters with their
 * JSON unicode escapes keeps the payload valid JSON while making tag breakout
 * impossible.
 */
export function jsonLdHtml(data: unknown) {
  return JSON.stringify(data).replace(/[<>&]/g, (character) => htmlEscapes[character]);
}

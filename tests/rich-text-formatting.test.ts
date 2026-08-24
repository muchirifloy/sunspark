import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/products/rich-text";

/**
 * The admin editor is a contentEditable driven by document.execCommand, and its
 * output is sanitized on save and again when the storefront renders it. These
 * cover the markup browsers actually emit, so formatting an admin applies
 * survives all the way to the product page.
 */
describe("admin editor formatting reaches the storefront", () => {
  it("keeps bold, italic and underline", () => {
    const html = sanitizeRichText("<p>Rated <b>100W</b>, <i>waterproof</i>, <u>IP67</u></p>");

    expect(html).toContain("<b>100W</b>");
    expect(html).toContain("<i>waterproof</i>");
    expect(html).toContain("<u>IP67</u>");
  });

  it("keeps bulleted and numbered lists", () => {
    expect(sanitizeRichText("<ul><li>12V input</li><li>IP67</li></ul>")).toBe(
      "<ul><li>12V input</li><li>IP67</li></ul>"
    );
    expect(sanitizeRichText("<ol><li>Mount</li><li>Connect</li></ol>")).toBe(
      "<ol><li>Mount</li><li>Connect</li></ol>"
    );
  });

  it("keeps headings from the format dropdown", () => {
    const html = sanitizeRichText("<h2>Specifications</h2><h3>Power</h3><p>100W</p>");

    expect(html).toContain("<h2>Specifications</h2>");
    expect(html).toContain("<h3>Power</h3>");
  });

  it("keeps links and hardens them", () => {
    const html = sanitizeRichText('<p>See <a href="https://example.com">datasheet</a></p>');

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps paragraph breaks typed as div blocks", () => {
    // Pressing Enter in a contentEditable emits <div> in Chrome. Dropping the
    // tag outright would run every paragraph together on the product page.
    const html = sanitizeRichText("<div>First paragraph</div><div>Second paragraph</div>");

    expect(html).toBe("<p>First paragraph</p><p>Second paragraph</p>");
  });

  it("keeps line breaks inside a block", () => {
    expect(sanitizeRichText("<div>Line one<br />Line two</div>")).toContain("<br />");
  });

  it("does not nest paragraphs when blocks are nested", () => {
    const html = sanitizeRichText("<div><div>Inner</div></div>");

    expect(html).not.toContain("<p><p>");
    expect(html).toContain("Inner");
  });

  it("still strips scripts and event handlers", () => {
    const html = sanitizeRichText('<p onclick="alert(1)">Hi</p><script>alert(2)</script>');

    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).toContain("Hi");
  });

  it("is idempotent, since it runs on save and again on render", () => {
    const once = sanitizeRichText("<div>First</div><div>Second</div>");

    expect(sanitizeRichText(once)).toBe(once);
  });

  it("preserves real editor output end to end, including list items", () => {
    // Captured from the TipTap editor in the browser after editing a product.
    const fromEditor =
      "<p>High brightness solar flood light.</p>" +
      "<p>Designed for powerful illumination.</p>" +
      "<ul><li><p>High brightness LED</p></li><li><p>Remote control included</p></li></ul>" +
      "<p></p>";

    const stored = sanitizeRichText(fromEditor);

    expect(stored).toContain("<p>High brightness solar flood light.</p>");
    expect(stored).toContain("<p>Designed for powerful illumination.</p>");
    expect(stored).toContain("Remote control included");
    expect(stored).toContain("<ul>");
    // The trailing empty block is dropped rather than rendering as a stray gap.
    expect(stored).not.toMatch(/<p>\s*<\/p>/);
    // Rendering the stored value again must not degrade it.
    expect(sanitizeRichText(stored)).toBe(stored);
  });
});

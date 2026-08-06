import { describe, expect, it } from "vitest";

import { mergeProductDescriptions, richTextToPlainText, sanitizeRichText } from "@/lib/products/rich-text";

describe("product rich text", () => {
  it("keeps supported formatting while removing unsafe markup", () => {
    const result = sanitizeRichText('<p>Safe <strong>details</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad link</a>');

    expect(result).toContain("<strong>details</strong>");
    expect(result).not.toContain("<script");
    expect(result).not.toContain("javascript:");
  });

  it("converts existing plain descriptions into paragraphs", () => {
    expect(sanitizeRichText("First line\nSecond line")).toBe("<p>First line<br />Second line</p>");
  });

  it("produces plain text for metadata and product feeds", () => {
    expect(richTextToPlainText("<p>Solar <strong>light</strong></p>")).toBe("Solar light");
  });

  it("merges legacy short and long descriptions without duplicating matching text", () => {
    expect(mergeProductDescriptions("Short details", "Long details")).toBe("<p>Short details</p><p>Long details</p>");
    expect(mergeProductDescriptions("Same details", "<p>Same details with specifications</p>"))
      .toBe("<p>Same details with specifications</p>");
  });
});

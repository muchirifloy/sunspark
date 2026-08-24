import { describe, expect, it } from "vitest";
import { jsonLdHtml } from "@/lib/json-ld";

// Built from a char code so the expectation cannot be confused with an escape
// sequence that the test file itself would resolve.
const backslash = String.fromCharCode(92);
const escapedLessThan = `${backslash}u003c`;

describe("jsonLdHtml", () => {
  it("stops a product name from closing the surrounding script tag", () => {
    const html = jsonLdHtml({ name: "Cable</script><script>alert(1)</script>" });

    expect(html).not.toContain("</script>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<");
    // The angle brackets survive as JSON unicode escapes, not raw markup.
    expect(html).toContain(escapedLessThan);
  });

  it("escapes entity-decoded angle brackets that survive rich-text stripping", () => {
    // richTextToPlainText decodes &lt; back to "<", so the raw character can
    // reach this serialiser even after sanitisation.
    const html = jsonLdHtml({ description: "<img src=x onerror=alert(1)>" });

    expect(html).not.toContain("<img");
    expect(html).not.toContain(">");
  });

  it("still produces the original data when parsed back", () => {
    const data = { name: "10mm Cable & Fittings", price: "1200.00" };

    expect(JSON.parse(jsonLdHtml(data))).toEqual(data);
  });

  it("round-trips a hostile value without losing it", () => {
    const name = "Cable</script><script>alert(1)</script>";

    expect(JSON.parse(jsonLdHtml({ name })).name).toBe(name);
  });
});

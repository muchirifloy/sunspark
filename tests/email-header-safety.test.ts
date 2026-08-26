import { describe, expect, it } from "vitest";
import { campaignEmailHtml, htmlEscape, paragraphs } from "../apps/api/src/email-template";

const brand = {
  name: "Sunspark Electricals & Solar",
  phone: "0703586562",
  website: "sunsparkelectricals.co.ke",
  supportEmail: "support@sunsparkelectricals.co.ke"
};

/**
 * The bulk email composer is the first place a person types text that ends up inside a
 * mail header and inside HTML. Both are injection surfaces, so both are covered here.
 */
describe("campaign email escaping", () => {
  it("escapes markup typed into the body rather than rendering it", () => {
    const html = paragraphs('<script>alert(1)</script> & "quoted"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("escapes the subject and heading where they are shown", () => {
    const html = campaignEmailHtml('Sale <img src=x onerror=alert(1)>', { body: "Hello" }, brand);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("escapes a quote in the button link so it cannot break out of the href", () => {
    const html = campaignEmailHtml("Offer", {
      body: "Hello",
      buttonLabel: "Shop",
      buttonUrl: 'https://example.com/" onmouseover="alert(1)'
    }, brand);
    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain("&quot;");
  });

  // The trading name carries an ampersand, which is a live entity opener in HTML.
  it("escapes the brand name in the header and footer", () => {
    const html = campaignEmailHtml("Offer", { body: "Hello" }, brand);
    expect(html).toContain("Sunspark Electricals &amp; Solar");
    expect(html).not.toContain("Sunspark Electricals & Solar");
  });

  it("leaves ordinary text intact", () => {
    expect(htmlEscape("Solar panels 20% off")).toBe("Solar panels 20% off");
    expect(paragraphs("First para\n\nSecond para")).toContain("Second para");
  });
});

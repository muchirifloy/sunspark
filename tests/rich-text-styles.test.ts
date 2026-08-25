import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/products/rich-text";

/**
 * The editor can now emit inline styles for colour, size, alignment and line
 * spacing. `style` is the one attribute that carries arbitrary text, so these
 * pin down both halves: the formatting an admin applies has to survive, and
 * anything outside the allow-list has to be dropped.
 */
describe("negotiated formatting survives sanitizing", () => {
  it("keeps text colour", () => {
    expect(sanitizeRichText('<p><span style="color:#c0392b">Warning</span></p>')).toContain("color:#c0392b");
  });

  it("keeps highlight colour", () => {
    expect(sanitizeRichText('<p><span style="background-color:#fff3cd">Note</span></p>')).toContain("background-color:#fff3cd");
  });

  it("keeps font size", () => {
    expect(sanitizeRichText('<p><span style="font-size:24px">Big</span></p>')).toContain("font-size:24px");
  });

  it("keeps text alignment on blocks", () => {
    expect(sanitizeRichText('<p style="text-align:center">Centered</p>')).toContain("text-align:center");
  });

  it("keeps line spacing on blocks", () => {
    expect(sanitizeRichText('<p style="line-height:1.8">Spaced</p>')).toContain("line-height:1.8");
  });

  it("keeps strikethrough", () => {
    expect(sanitizeRichText("<p>Was <s>5000</s> now 4000</p>")).toContain("<s>5000</s>");
  });
});

describe("style attribute cannot be used to smuggle anything", () => {
  it("drops properties that are not on the allow-list", () => {
    const html = sanitizeRichText('<p><span style="position:fixed;top:0;left:0;width:100vw;height:100vh">x</span></p>');

    expect(html).not.toContain("position");
    expect(html).not.toContain("100vw");
  });

  it("drops url() values", () => {
    const html = sanitizeRichText('<p><span style="background-color:url(javascript:alert(1))">x</span></p>');

    expect(html).not.toContain("url(");
    expect(html).not.toContain("javascript");
  });

  it("drops a colour that is not a plain hex or rgb value", () => {
    const html = sanitizeRichText('<p><span style="color:expression(alert(1))">x</span></p>');

    expect(html).not.toContain("expression");
  });

  it("rejects a font size large enough to cover surrounding UI", () => {
    expect(sanitizeRichText('<p><span style="font-size:900px">x</span></p>')).not.toContain("900px");
    expect(sanitizeRichText('<p><span style="font-size:72px">ok</span></p>')).toContain("72px");
  });

  it("still strips script and event handlers", () => {
    const html = sanitizeRichText('<p onclick="alert(1)">hi</p><script>alert(2)</script>');

    expect(html).not.toContain("onclick");
    expect(html).not.toContain("script");
    expect(html).toContain("hi");
  });

  it("does not allow style on an anchor, where it could disguise a link", () => {
    const html = sanitizeRichText('<p><a href="https://evil.test" style="color:#fff">hidden</a></p>');

    expect(html).not.toContain("style");
    expect(html).toContain('href="https://evil.test"');
  });
});

/**
 * TipTap serialises inline styles with a space after the colon and sometimes a
 * trailing semicolon. These are the literal shapes the editor emits, so a
 * mismatch between its output and the sanitizer's regexes would silently drop an
 * admin's formatting on save.
 */
describe("the editor's actual output survives the sanitizer", () => {
  it("accepts the spacing tiptap uses around the colon", () => {
    expect(sanitizeRichText('<p><span style="color: #c0392b">x</span></p>')).toContain("#c0392b");
    expect(sanitizeRichText('<p><span style="font-size: 24px;">x</span></p>')).toContain("24px");
    expect(sanitizeRichText('<p style="text-align: center;">x</p>')).toContain("center");
    expect(sanitizeRichText('<p style="line-height: 1.5;">x</p>')).toContain("1.5");
  });

  it("keeps several declarations on one element", () => {
    const html = sanitizeRichText('<p><span style="color: #15803d; font-size: 20px; background-color: #fff3cd">x</span></p>');

    expect(html).toContain("#15803d");
    expect(html).toContain("20px");
    expect(html).toContain("#fff3cd");
  });

  it("keeps a styled block and a styled span together", () => {
    const html = sanitizeRichText('<p style="text-align: center; line-height: 2"><span style="color: #0e52a4">Centered blue</span></p>');

    expect(html).toContain("center");
    expect(html).toContain("#0e52a4");
    expect(html).toContain("Centered blue");
  });
});

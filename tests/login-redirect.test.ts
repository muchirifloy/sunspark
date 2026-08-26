import { describe, expect, it } from "vitest";
import { isAdminPath, safeNext } from "@/lib/auth/next-path";

/**
 * `next` is the only part of the login the browser controls, so it is the only part an
 * attacker can aim. These cover both ways it could be aimed: off the site entirely, and
 * into the dashboard from a customer account.
 */
describe("post-login redirect targets", () => {
  it("keeps an ordinary storefront path", () => {
    expect(safeNext("/account/orders", "CUSTOMER")).toBe("/account/orders");
    expect(safeNext("/cart", "CUSTOMER")).toBe("/cart");
  });

  it("refuses to send anyone off the site", () => {
    for (const role of ["CUSTOMER", "STAFF", "ADMIN"] as const) {
      expect(safeNext("https://evil.example", role)).toBe("");
      expect(safeNext("//evil.example", role)).toBe("");
      // Browsers fold backslashes into forward slashes, so this arrives as //evil.
      expect(safeNext("/\\evil.example", role)).toBe("");
      expect(safeNext("javascript:alert(1)", role)).toBe("");
      expect(safeNext("", role)).toBe("");
    }
  });

  it("does not let a customer be routed into the dashboard", () => {
    expect(safeNext("/admin", "CUSTOMER")).toBe("");
    expect(safeNext("/admin/sms", "CUSTOMER")).toBe("");
    expect(safeNext("/admin?view=bulk", "CUSTOMER")).toBe("");
    expect(safeNext("/admin/products", undefined)).toBe("");
  });

  it("lets staff and admins return to the admin page they asked for", () => {
    expect(safeNext("/admin/sms", "ADMIN")).toBe("/admin/sms");
    expect(safeNext("/admin/orders", "STAFF")).toBe("/admin/orders");
  });

  // "/administrators" is a storefront path that merely starts with the same letters, so
  // a naive startsWith("/admin") would wrongly treat it as back office.
  it("only treats real admin routes as admin routes", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/orders")).toBe(true);
    expect(isAdminPath("/administrators")).toBe(false);
    expect(safeNext("/administrators", "CUSTOMER")).toBe("/administrators");
  });
});

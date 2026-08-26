import { expect, test } from "@playwright/test";

test.describe("Sunspark storefront", () => {
  test("homepage is direct to categories and products without public admin link", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Sunspark home" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Products$/ }).first()).toBeVisible();
    await expect(page.locator(".category-tile").first()).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Admin" })).toHaveCount(0);

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
  });

  test("store, cart, checkout, and admin login routes load", async ({ page }) => {
    await page.goto("/store");
    await expect(page.getByRole("heading", { name: "Store" })).toBeVisible();

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Shopping Cart" })).toBeVisible();

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    // /admin/login forwards to the one login shared with customers.
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Password")).toHaveCount(1);
    await expect(page.getByText("Initial setup")).toHaveCount(0);
  });
});

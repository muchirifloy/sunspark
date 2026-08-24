"use server";

import { preventAdminShopping } from "@/lib/auth/guards";
import { CartLimitError, addCartItem, getCartItemCount, updateCartItem } from "@/lib/cart/cart-service";
import type { ActionResult } from "@/lib/actions/result";

export async function addToCartAction(slug: string): Promise<ActionResult> {
  try {
    await preventAdminShopping();
    await addCartItem(slug, 1);
    return { ok: true, message: "Added to cart.", cartCount: await getCartItemCount() };
  } catch (error) {
    if (error instanceof CartLimitError) return { ok: false, message: error.message };
    return { ok: false, message: "Could not add this product. Please try again." };
  }
}

export async function addSelectedToCartAction(slug: string, formData: FormData): Promise<ActionResult> {
  try {
    await preventAdminShopping();
    const optionId = String(formData.get("optionId") ?? "") || null;
    await addCartItem(slug, 1, optionId);
    return { ok: true, message: "Added to cart.", cartCount: await getCartItemCount() };
  } catch (error) {
    if (error instanceof CartLimitError) return { ok: false, message: error.message };
    return { ok: false, message: "Could not add this option. Please try again." };
  }
}

export async function updateCartAction(formData: FormData): Promise<ActionResult> {
  try {
    await preventAdminShopping();
    const slug = String(formData.get("slug") ?? "");
    const optionId = String(formData.get("optionId") ?? "") || null;
    const quantity = Number(formData.get("quantity") ?? 0);
    await updateCartItem(slug, Number.isFinite(quantity) ? quantity : 0, optionId);
    return { ok: true, message: "Cart updated.", cartCount: await getCartItemCount() };
  } catch {
    return { ok: false, message: "Cart update failed. Your previous quantity was kept." };
  }
}

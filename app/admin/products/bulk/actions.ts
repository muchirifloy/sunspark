"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { catalogTag } from "@/lib/cache-tags";
import { apiFetch, ApiError } from "@/lib/api/client";
import { requireOwnerAdmin } from "@/lib/auth/guards";
import type { ActionResult } from "@/lib/actions/result";

const optionEditSchema = z.object({
  id: z.string().trim().min(2).max(80),
  priceCents: z.number().int().min(0),
  compareAtCents: z.number().int().min(0).nullable(),
  costCents: z.number().int().min(0),
  stockMultiplier: z.number().positive().max(100000)
});

const productEditSchema = z.object({
  id: z.string().trim().min(2).max(80),
  stockQuantity: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0),
  priceCents: z.number().int().min(0).optional(),
  compareAtCents: z.number().int().min(0).nullable().optional(),
  costCents: z.number().int().min(0).optional(),
  options: z.array(optionEditSchema).max(12)
});

export type BulkOptionEdit = z.infer<typeof optionEditSchema>;
export type BulkProductEdit = z.infer<typeof productEditSchema>;

/**
 * Saves only the rows the operator actually touched. A page of 100 products is
 * rarely edited wholesale, and sending untouched rows back would turn every
 * save into 100 writes against columns nobody changed.
 */
export async function saveBulkProductsAction(products: BulkProductEdit[]): Promise<ActionResult> {
  await requireOwnerAdmin();

  const parsed = z.array(productEditSchema).min(1).max(100).safeParse(products);
  if (!parsed.success) {
    return { ok: false, message: "Some rows hold values that cannot be saved. Check the highlighted fields." };
  }

  try {
    await apiFetch("/admin/products/bulk-pricing", {
      method: "PATCH",
      body: JSON.stringify({ products: parsed.data })
    });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    const message = error instanceof Error ? error.message.slice(0, 180) : "The request could not be completed.";
    console.error("Bulk product save failed", { status, message });
    return { ok: false, message: `Nothing was saved. ${message}` };
  }

  updateTag(catalogTag);
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/admin/products");
  revalidatePath("/admin/products/bulk");

  const count = parsed.data.length;
  return { ok: true, message: `Saved ${count} product${count === 1 ? "" : "s"}.` };
}

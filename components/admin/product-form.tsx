"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ProductGalleryEditor } from "@/components/admin/product-gallery-editor";
import { AdminRichTextEditor } from "@/components/admin/admin-rich-text-editor";
import type { ActionResult } from "@/lib/actions/result";
import { publicImageUrl } from "@/lib/products/images";
import type { Category, Product, ProductImage } from "@/lib/types";

type ProductWithImages = Product & { images: ProductImage[] };

const sellingUnits = [
  ["UNIT", "Unit / piece"], ["METRE", "Metre"], ["ROLL", "Roll"], ["CARTON", "Carton"],
  ["BOX", "Box"], ["PACK", "Pack"], ["PAIR", "Pair"], ["SET", "Set"],
  ["LITRE", "Litre"], ["KILOGRAM", "Kilogram"],
] as const;

export function ProductForm({ action, categories, descriptionHtml = "", product }: {
  action: (formData: FormData) => Promise<ActionResult>;
  categories: Category[];
  /** Pre-merged and sanitized on the server so sanitize-html stays out of the client bundle. */
  descriptionHtml?: string;
  product?: ProductWithImages | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const images = (product?.images ?? []).map((image) => ({
    alt: image.alt,
    id: image.id,
    isPrimary: image.isPrimary,
    url: publicImageUrl(image.url),
  }));

  return (
    <form className="product-editor" id="product-editor-form" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setResult(null);
      startTransition(async () => {
        const nextResult = await action(formData);
        setResult(nextResult);
        if (nextResult.ok && nextResult.redirectTo) router.push(nextResult.redirectTo);
      });
    }}>
      <header className="editor-command-bar">
        <div>
          <strong>{product ? "Editing product" : "New product"}</strong>
          <span>Changes remain on this screen until you save.</span>
        </div>
        <nav aria-label="Product editor actions">
          {product ? <Link className="secondary-btn" href={`/product/${product.slug}`} target="_blank">Preview</Link> : null}
          <Link className="secondary-btn" href="/admin/products">Cancel</Link>
          <button aria-busy={isPending} className="primary-btn" disabled={isPending} type="submit">{isPending ? "Saving product..." : product ? "Save changes" : "Create product"}</button>
        </nav>
      </header>
      {result ? <p className={`admin-feedback ${result.ok ? "success" : "error"}`} role={result.ok ? "status" : "alert"}>{result.message}</p> : null}

      <section className="editor-card product-gallery-card">
        <div className="editor-card-heading compact"><div><h2>Product images</h2><p>Preview uploads and choose the storefront cover.</p></div></div>
        <ProductGalleryEditor images={images} productName={product?.name ?? "New product"} />
      </section>

      <section className="editor-card product-information-card">
        <div className="editor-card-heading compact"><div><h2>Product information</h2><p>The details customers see while shopping.</p></div></div>
        <label className="field-wide">Product name <input name="name" defaultValue={product?.name ?? ""} required /></label>
        <div className="form-grid two">
          <label>Category
            <select name="categoryId" defaultValue={product?.categoryId ?? ""} required>
              <option value="">Select category</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>Brand <input name="brand" defaultValue={product?.brand ?? ""} placeholder="Optional" /></label>
        </div>
        <label>Full description <AdminRichTextEditor ariaLabel="Full product description" initialHtml={descriptionHtml} name="description" /></label>
      </section>

      <div className="editor-column editor-commerce-column">
        <section className="editor-card publish-card">
          <div className="editor-card-heading compact"><div><h2>Product status</h2><p>Storefront visibility and labels.</p></div></div>
          <div className="product-status-options">
            <label className="check-label form-switch"><input name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} /><span><strong>Active</strong><small>Visible to customers</small></span></label>
            <label className="check-label form-switch"><input name="isFeatured" type="checkbox" defaultChecked={product?.isFeatured ?? false} /><span><strong>Featured</strong><small>Prioritize in product rows</small></span></label>
            <label className="check-label form-switch"><input name="isHotDeal" type="checkbox" defaultChecked={product?.isHotDeal ?? false} /><span><strong>Hot deal</strong><small>Show the deal badge</small></span></label>
          </div>
        </section>
      </div>

      <div className="editor-column editor-stock-column">
        <section className="editor-card">
          <div className="editor-card-heading compact"><div><h2>Inventory</h2><p>Stock controls and selling unit.</p></div></div>
          <div className="form-grid two tight">
            <label>Stock <input name="stockQuantity" type="number" min="0" defaultValue={product?.stockQuantity ?? 0} required /></label>
            <label>Low alert <input name="lowStockThreshold" type="number" min="0" defaultValue={product?.lowStockThreshold ?? 3} /></label>
          </div>
          <p className={`stock-indicator ${(product?.stockQuantity ?? 0) > 0 ? "available" : "empty"}`}>{(product?.stockQuantity ?? 0) > 0 ? "Currently in stock" : "Currently out of stock"}</p>
        </section>
        <details className="editor-card seo-card">
          <summary>Search engine details</summary>
          <label>SEO title <input name="seoTitle" defaultValue={product?.seoTitle ?? ""} /></label>
          <label>SEO description <textarea name="seoDescription" defaultValue={product?.seoDescription ?? ""} rows={3} /></label>
          <label>SEO keywords <input name="seoKeywords" defaultValue={product?.seoKeywords ?? ""} /></label>
        </details>
        <section className="editor-card editor-save-summary">
          <h2>Ready to publish?</h2>
          <p>Save once after reviewing images, pricing and stock.</p>
          <button aria-busy={isPending} className="primary-btn" disabled={isPending} type="submit">{isPending ? "Saving product..." : product ? "Save changes" : "Create product"}</button>
        </section>
      </div>

      <section className="editor-card product-options-card">
        <div className="editor-card-heading compact"><div><h2>Selling options</h2><p>Use this when one product sells as a unit, metre, roll, carton or pack.</p></div></div>
        <div className="option-editor-table" role="group" aria-label="Selling option prices and stock usage">
          <div className="option-editor-grid option-editor-head" role="row"><span>Default</span><span>Label</span><span>Unit</span><span>Sell</span><span>Compare</span><span>Cost</span><span>Stock x</span><span>Remove</span></div>
          {(product?.options ?? []).map((option) => (
          <div className="option-editor-grid option-editor-row" role="row" key={option.id}>
            <label className="icon-radio"><input type="radio" name="defaultOptionKey" value={`id:${option.id}`} defaultChecked={option.isDefault} /><span>Default</span></label>
            <input name="optionId" type="hidden" value={option.id} />
            <input name="optionLabel" defaultValue={option.label} aria-label="Option label" />
            <select name="optionSellingUnit" defaultValue={option.sellingUnit} aria-label="Option unit">{sellingUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input name="optionPriceKsh" type="number" min="0" step="0.01" defaultValue={option.priceCents / 100} aria-label="Selling price" required={option.isDefault} />
            <input name="optionCompareAtKsh" type="number" min="0" step="0.01" defaultValue={option.compareAtCents ? option.compareAtCents / 100 : ""} aria-label="Compare price" />
            <input name="optionCostKsh" type="number" min="0" step="0.01" defaultValue={option.costCents / 100} aria-label="Buying cost" />
            <input name="optionStockMultiplier" type="number" min="0.01" step="0.01" defaultValue={option.stockMultiplier ?? 1} aria-label="Stock multiplier" />
            <label className="check-label danger-label"><input name="deleteOptionIds" type="checkbox" value={option.id} />Remove</label>
          </div>
          ))}
          {[0, 1, 2].map((index) => (
          <div className="option-editor-grid option-editor-row option-editor-new" role="row" key={`new-${index}`}>
            <label className="icon-radio"><input type="radio" name="defaultOptionKey" value={`index:${(product?.options.length ?? 0) + index}`} defaultChecked={!product?.options.length && index === 0} /><span>Default</span></label>
            <input name="optionId" type="hidden" value="" />
            <input name="optionLabel" defaultValue={!product?.options.length && index === 0 ? "Unit" : ""} placeholder={index === 0 ? "Unit" : index === 1 ? "Roll" : "Per metre"} aria-label="New option label" />
            <select name="optionSellingUnit" defaultValue={index === 1 ? "ROLL" : index === 2 ? "METRE" : "UNIT"} aria-label="New option unit">{sellingUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <input name="optionPriceKsh" type="number" min="0" step="0.01" placeholder="Sell" aria-label="New selling price" required={!product?.options.length && index === 0} />
            <input name="optionCompareAtKsh" type="number" min="0" step="0.01" placeholder="Compare" aria-label="New compare price" />
            <input name="optionCostKsh" type="number" min="0" step="0.01" placeholder="Cost" aria-label="New buying cost" />
            <input name="optionStockMultiplier" type="number" min="0.01" step="0.01" defaultValue={1} aria-label="New stock multiplier" />
            <span className="muted-cell">New</span>
          </div>
          ))}
        </div>
        <p className="editor-help">Stock x is the quantity consumed by one option. Example: a 100m roll consumes 100 metres.</p>
      </section>
    </form>
  );
}

import type { Category, Product, ProductImage } from "@/lib/types";
import { PendingButton } from "@/components/ui/pending-button";
import { publicImageUrl } from "@/lib/products/images";

type ProductWithImages = Product & {
  images: ProductImage[];
};

const sellingUnits = [
  ["UNIT", "Unit / piece"],
  ["METRE", "Metre"],
  ["ROLL", "Roll"],
  ["CARTON", "Carton"],
  ["BOX", "Box"],
  ["PACK", "Pack"],
  ["PAIR", "Pair"],
  ["SET", "Set"],
  ["LITRE", "Litre"],
  ["KILOGRAM", "Kilogram"]
] as const;

export function ProductForm({
  action,
  categories,
  product
}: {
  action: (formData: FormData) => Promise<void>;
  categories: Category[];
  product?: ProductWithImages | null;
}) {
  return (
    <form action={action} className="product-editor">
      <div className="product-editor-main">
        <section className="editor-card">
          <div className="editor-card-heading">
            <span>01</span>
            <div>
              <h2>Product information</h2>
              <p>Core details customers use to understand and find this product.</p>
            </div>
          </div>
          <label className="field-wide">
            Product name
            <input name="name" defaultValue={product?.name ?? ""} required />
          </label>
          <div className="form-grid two">
            <label>
              Category
              <select name="categoryId" defaultValue={product?.categoryId ?? ""} required>
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Brand
              <input name="brand" defaultValue={product?.brand ?? ""} placeholder="Optional, for example Schneider" />
            </label>
          </div>
          <label>
            Short description
            <textarea name="shortDescription" defaultValue={product?.shortDescription ?? ""} rows={3} />
          </label>
          <label>
            Full description
            <textarea name="description" defaultValue={product?.description ?? ""} rows={7} />
          </label>
        </section>

        <section className="editor-card">
          <div className="editor-card-heading">
            <span>02</span>
            <div>
              <h2>Product gallery</h2>
              <p>Use clean WebP photos where possible. PNG and JPEG are accepted under 2MB each.</p>
            </div>
          </div>
          <label className="file-drop product-file-drop">
            <strong>Add product images</strong>
            <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple />
            <small>Uploads are stored on the HostAfrica backend and linked to this product.</small>
          </label>
          {product?.images.length ? (
            <div className="admin-image-grid product-image-manager">
              {product.images.map((image) => (
                <div className="admin-image-card" key={image.id}>
                  <img alt={image.alt ?? product.name} src={publicImageUrl(image.url)} />
                  <div className="image-card-controls">
                    <label className="check-label">
                      <input name="primaryImageId" type="radio" value={image.id} defaultChecked={image.isPrimary} />
                      Cover
                    </label>
                    <label className="check-label danger-label">
                      <input name="deleteImageIds" type="checkbox" value={image.id} />
                      Remove
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="editor-empty">No product images yet.</p>
          )}
        </section>

        <details className="editor-card seo-card">
          <summary>Search engine details</summary>
          <label>
            SEO title
            <input name="seoTitle" defaultValue={product?.seoTitle ?? ""} />
          </label>
          <label>
            SEO description
            <textarea name="seoDescription" defaultValue={product?.seoDescription ?? ""} rows={3} />
          </label>
          <label>
            SEO keywords
            <input name="seoKeywords" defaultValue={product?.seoKeywords ?? ""} />
          </label>
        </details>
      </div>

      <aside className="product-editor-side">
        <section className="editor-card publish-card">
          <div className="editor-card-heading compact">
            <div>
              <h2>Publish</h2>
              <p>Visibility and promotional labels.</p>
            </div>
          </div>
          <label className="check-label form-switch">
            <input name="isActive" type="checkbox" defaultChecked={product?.isActive ?? true} />
            <span><strong>Active</strong><small>Visible to customers.</small></span>
          </label>
          <label className="check-label form-switch">
            <input name="isFeatured" type="checkbox" defaultChecked={product?.isFeatured ?? false} />
            <span><strong>Featured</strong><small>Prioritize in product rows.</small></span>
          </label>
          <label className="check-label form-switch">
            <input name="isHotDeal" type="checkbox" defaultChecked={product?.isHotDeal ?? false} />
            <span><strong>Hot deal</strong><small>Show deal badge.</small></span>
          </label>
        </section>

        <section className="editor-card">
          <div className="editor-card-heading compact">
            <div>
              <h2>Pricing</h2>
              <p>Customer price and private cost.</p>
            </div>
          </div>
          <label>
            Price (KSH)
            <input name="priceKsh" type="number" min="0" step="0.01" defaultValue={product ? product.priceCents / 100 : ""} required />
          </label>
          <label>
            Compare at (KSH)
            <input name="compareAtKsh" type="number" min="0" step="0.01" defaultValue={product?.compareAtCents ? product.compareAtCents / 100 : ""} />
          </label>
          <label>
            Buying cost (admin only)
            <input name="costKsh" type="number" min="0" step="0.01" defaultValue={product ? product.costCents / 100 : ""} />
          </label>
        </section>

        <section className="editor-card">
          <div className="editor-card-heading compact">
            <div>
              <h2>Inventory</h2>
              <p>Stock controls and selling unit.</p>
            </div>
          </div>
          <label>
            Selling unit
            <select defaultValue={product?.sellingUnit ?? "UNIT"} name="sellingUnit">
              {sellingUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="form-grid two tight">
            <label>
              Stock
              <input name="stockQuantity" type="number" min="0" defaultValue={product?.stockQuantity ?? 0} required />
            </label>
            <label>
              Low alert
              <input name="lowStockThreshold" type="number" min="0" defaultValue={product?.lowStockThreshold ?? 3} />
            </label>
          </div>
        </section>

        <div className="editor-submit-bar">
          <PendingButton pendingText="Saving product...">{product ? "Save changes" : "Create product"}</PendingButton>
        </div>
      </aside>

      <section className="editor-card product-options-card">
        <div className="editor-card-heading compact">
          <div>
            <h2>Selling options</h2>
            <p>Use this when one product sells as unit, metre, roll, carton, or pack.</p>
          </div>
        </div>
        <div className="option-editor-grid option-editor-head">
          <span>Default</span>
          <span>Label</span>
          <span>Unit</span>
          <span>Sell</span>
          <span>Compare</span>
          <span>Cost</span>
          <span>Stock x</span>
          <span>Remove</span>
        </div>
        {(product?.options ?? []).map((option) => (
          <div className="option-editor-grid" key={option.id}>
            <label className="icon-radio"><input type="radio" name="defaultOptionId" value={option.id} defaultChecked={option.isDefault} /><span>Default</span></label>
            <input name="optionId" type="hidden" value={option.id} />
            <input name="optionLabel" defaultValue={option.label} aria-label="Option label" />
            <select name="optionSellingUnit" defaultValue={option.sellingUnit} aria-label="Option unit">
              {sellingUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input name="optionPriceKsh" type="number" min="0" step="0.01" defaultValue={option.priceCents / 100} aria-label="Selling price" />
            <input name="optionCompareAtKsh" type="number" min="0" step="0.01" defaultValue={option.compareAtCents ? option.compareAtCents / 100 : ""} aria-label="Compare price" />
            <input name="optionCostKsh" type="number" min="0" step="0.01" defaultValue={option.costCents / 100} aria-label="Buying cost" />
            <input name="optionStockMultiplier" type="number" min="0.01" step="0.01" defaultValue={option.stockMultiplier ?? 1} aria-label="Stock multiplier" />
            <label className="check-label danger-label"><input name="deleteOptionIds" type="checkbox" value={option.id} />Remove</label>
          </div>
        ))}
        {[0, 1, 2].map((index) => (
          <div className="option-editor-grid option-editor-new" key={`new-${index}`}>
            <label className="icon-radio"><input type="radio" name="defaultOptionIndex" value={(product?.options.length ?? 0) + index} /><span>Default</span></label>
            <input name="optionId" type="hidden" value="" />
            <input name="optionLabel" placeholder={index === 0 ? "Per metre" : index === 1 ? "Roll" : "Unit"} aria-label="New option label" />
            <select name="optionSellingUnit" defaultValue={index === 0 ? "METRE" : index === 1 ? "ROLL" : "UNIT"} aria-label="New option unit">
              {sellingUnits.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input name="optionPriceKsh" type="number" min="0" step="0.01" placeholder="Sell" aria-label="New selling price" />
            <input name="optionCompareAtKsh" type="number" min="0" step="0.01" placeholder="Compare" aria-label="New compare price" />
            <input name="optionCostKsh" type="number" min="0" step="0.01" placeholder="Cost" aria-label="New buying cost" />
            <input name="optionStockMultiplier" type="number" min="0.01" step="0.01" defaultValue={1} aria-label="New stock multiplier" />
            <span className="muted-cell">New</span>
          </div>
        ))}
        <p className="editor-help">Stock x means how much product stock one option consumes. Example: per metre = 1, a 100m roll = 100.</p>
      </section>
    </form>
  );
}

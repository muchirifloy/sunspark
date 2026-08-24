import Link from "next/link";
import type { Category, CategoryImage } from "@/lib/types";
import { PendingButton } from "@/components/ui/pending-button";
import { publicImageUrl } from "@/lib/products/images";

type CategoryWithImages = Category & { images: CategoryImage[] };

export function CategoryForm({
  action,
  cancelHref,
  category
}: {
  action: (formData: FormData) => Promise<void>;
  cancelHref?: string;
  category?: CategoryWithImages;
}) {
  const isEditing = Boolean(category);

  return (
    <form action={action} className="category-editor">
      <section className="settings-card category-details-card">
        <div className="settings-card-header"><div><span>Category</span><h2>Category details</h2><p>Name, storefront text, visibility, and display priority.</p></div></div>
        <div className="settings-fields">
          <label><span>Category name</span><input defaultValue={category?.name ?? ""} name="name" required /></label>
          <label><span>Display order</span><input defaultValue={category?.sortOrder ?? 10} min="0" name="sortOrder" type="number" /></label>
          <label className="settings-field-full"><span>Customer-facing description</span><textarea defaultValue={category?.description ?? ""} name="description" rows={4} /><small>Maximum 15 words. Storefront cards show the first 10 words.</small></label>
        </div>
        <label className="check-label form-switch category-visibility">
          <input defaultChecked={category?.isActive ?? true} name="isActive" type="checkbox" />
          <span><strong>Show on storefront</strong><small>Visible on the homepage and in customer navigation.</small></span>
        </label>
      </section>

      <section className="settings-card category-images-card">
        <div className="settings-card-header"><div><span>Media</span><h2>Category images</h2><p>Add imagery and choose the cover shown to customers.</p></div></div>
        <label className="category-image-upload">
          <span>{isEditing ? "Add more category images" : "Upload category images"}</span>
          <input accept="image/jpeg,image/png,image/webp" multiple name="images" type="file" />
          <small>JPEG, PNG, or WebP. Each image must be below 5 MB. Large photos are resized automatically.</small>
        </label>
        {category?.images.length ? (
          <div className="admin-image-grid category-image-grid">
            {category.images.map((image) => (
              <div className="admin-image-card" key={image.id}>
                <img alt={image.alt ?? category.name} src={publicImageUrl(image.url)} />
                <label className="check-label"><input defaultChecked={image.isPrimary} name="primaryImageId" type="radio" value={image.id} />Cover image</label>
                <label className="check-label danger-label"><input name="deleteImageIds" type="checkbox" value={image.id} />Remove image</label>
              </div>
            ))}
          </div>
        ) : <p className="editor-empty">No category images yet.</p>}
      </section>

      <div className="admin-form-actions category-editor-actions">
        <PendingButton pendingText={isEditing ? "Saving changes..." : "Creating category..."}>{isEditing ? "Save changes" : "Create category"}</PendingButton>
        {cancelHref ? <Link className="secondary-btn" href={cancelHref}>Cancel</Link> : null}
      </div>
    </form>
  );
}

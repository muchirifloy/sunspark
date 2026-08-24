"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type CurrentImage = {
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
};

type PreviewImage = {
  file: File;
  key: string;
  url: string;
};

export function ProductGalleryEditor({ images, productName }: { images: CurrentImage[]; productName: string }) {
  const initialCover = images.find((image) => image.isPrimary)?.id ?? images[0]?.id ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);
  const [coverId, setCoverId] = useState(initialCover);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [uploads, setUploads] = useState<PreviewImage[]>([]);
  const [activeKey, setActiveKey] = useState(initialCover);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const visibleExisting = images.filter((image) => !removedIds.includes(image.id));
  const activeExisting = visibleExisting.find((image) => image.id === activeKey);
  const activeUpload = uploads.find((image) => image.key === activeKey);
  const activeImage = activeExisting ?? activeUpload ?? visibleExisting[0] ?? uploads[0] ?? null;

  function syncFiles(nextUploads: PreviewImage[]) {
    if (!inputRef.current || typeof DataTransfer === "undefined") return;
    const transfer = new DataTransfer();
    nextUploads.forEach(({ file }) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
  }

  function addFiles(files: FileList | null) {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!selected.length) return;

    const next = selected.map((file, index) => {
      const url = URL.createObjectURL(file);
      previewUrls.current.push(url);
      return { file, key: `new-${file.name}-${file.lastModified}-${index}`, url };
    });
    const merged = [...uploads, ...next].slice(0, Math.max(8 - visibleExisting.length, 0));
    setUploads(merged);
    syncFiles(merged);
    if (!activeImage && merged[0]) setActiveKey(merged[0].key);
  }

  function removeUpload(key: string) {
    const target = uploads.find((image) => image.key === key);
    if (target) URL.revokeObjectURL(target.url);
    const next = uploads.filter((image) => image.key !== key);
    setUploads(next);
    syncFiles(next);
    if (activeKey === key) setActiveKey(visibleExisting[0]?.id ?? next[0]?.key ?? "");
  }

  function toggleExistingImage(id: string) {
    const removing = !removedIds.includes(id);
    const nextRemoved = removing ? [...removedIds, id] : removedIds.filter((item) => item !== id);
    setRemovedIds(nextRemoved);

    if (removing && activeKey === id) {
      const replacement = images.find((image) => image.id !== id && !nextRemoved.includes(image.id));
      setActiveKey(replacement?.id ?? uploads[0]?.key ?? "");
    }

    if (removing && coverId === id) {
      const replacement = images.find((image) => image.id !== id && !nextRemoved.includes(image.id));
      setCoverId(replacement?.id ?? "");
    }
  }

  return (
    <div className="gallery-editor">
      {coverId ? <input name="primaryImageId" type="hidden" value={coverId} /> : null}
      {removedIds.map((id) => <input key={id} name="deleteImageIds" type="hidden" value={id} />)}

      <div className="gallery-stage">
        {activeImage ? (
          <Image
            alt={"alt" in activeImage ? activeImage.alt ?? productName : productName}
            fill
            priority
            sizes="(max-width: 760px) 90vw, 280px"
            src={activeImage.url}
            unoptimized={activeImage.url.startsWith("blob:")}
          />
        ) : (
          <div className="gallery-empty"><span>＋</span><strong>Add the first product image</strong></div>
        )}
        {activeExisting?.id === coverId ? <span className="gallery-cover-badge">Main</span> : null}
      </div>

      <div className="gallery-thumbnails" aria-label="Product images">
        {images.map((image) => {
          const removed = removedIds.includes(image.id);
          return (
            <div className={`gallery-thumbnail${activeKey === image.id ? " active" : ""}${removed ? " removed" : ""}`} key={image.id}>
              <button aria-label={`View ${image.alt ?? productName}`} onClick={() => !removed && setActiveKey(image.id)} type="button">
                <Image alt="" fill sizes="64px" src={image.url} />
              </button>
              {!removed ? (
                <button className="gallery-remove" aria-label="Remove image" onClick={() => toggleExistingImage(image.id)} type="button">×</button>
              ) : (
                <button className="gallery-undo" onClick={() => toggleExistingImage(image.id)} type="button">Undo</button>
              )}
            </div>
          );
        })}
        {uploads.map((image) => (
          <div className={`gallery-thumbnail new${activeKey === image.key ? " active" : ""}`} key={image.key}>
            <button aria-label={`View new image ${image.file.name}`} onClick={() => setActiveKey(image.key)} type="button">
              <Image alt="" fill sizes="64px" src={image.url} unoptimized />
            </button>
            <button className="gallery-remove" aria-label="Remove new image" onClick={() => removeUpload(image.key)} type="button">×</button>
          </div>
        ))}
        {visibleExisting.length + uploads.length < 8 ? (
          <label className="gallery-add" title="Add product images">
            <span>＋</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              multiple
              name="images"
              onChange={(event) => addFiles(event.target.files)}
              ref={inputRef}
              type="file"
            />
          </label>
        ) : null}
      </div>

      {visibleExisting.length ? (
        <div className="gallery-cover-picker">
          <span>Cover image</span>
          <select onChange={(event) => { setCoverId(event.target.value); setActiveKey(event.target.value); }} value={coverId}>
            {visibleExisting.map((image, index) => <option key={image.id} value={image.id}>Image {index + 1}</option>)}
          </select>
        </div>
      ) : null}
      <p className="gallery-help">JPG, PNG or WebP · maximum 5 MB each · up to 8 images · large photos are resized automatically</p>
    </div>
  );
}

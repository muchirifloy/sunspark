"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type SlideshowImage = {
  url: string;
  alt: string | null;
};

type ProductCardSlideshowProps = {
  images: SlideshowImage[];
};

const SLIDE_DURATION_MS = 2600;

export function ProductCardSlideshow({ images }: ProductCardSlideshowProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loadedCount, setLoadedCount] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [failedIndexes, setFailedIndexes] = useState<number[]>([]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || images.length < 2 || pendingIndex !== null) {
      return;
    }

    let nextIndex: number | null = null;
    for (let offset = 1; offset <= images.length; offset += 1) {
      const candidate = (activeIndex + offset) % images.length;
      if (!failedIndexes.includes(candidate)) {
        nextIndex = candidate;
        break;
      }
    }

    if (nextIndex === null || nextIndex === activeIndex) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (nextIndex < loadedCount) {
        setActiveIndex(nextIndex);
        return;
      }

      setPendingIndex(nextIndex);
      setLoadedCount(nextIndex + 1);
    }, SLIDE_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [activeIndex, failedIndexes, images.length, isVisible, loadedCount, pendingIndex]);

  return (
    <span className="product-image-stack" ref={containerRef} aria-hidden="true">
      {images.slice(0, loadedCount).map((image, index) => (
        <Image
          alt=""
          className={index === activeIndex ? "is-active" : undefined}
          fill
          key={`${image.url}-${index}`}
          onError={() => {
            setFailedIndexes((current) => current.includes(index) ? current : [...current, index]);
            if (pendingIndex === index) setPendingIndex(null);
          }}
          onLoad={() => {
            if (pendingIndex === index) {
              setActiveIndex(index);
              setPendingIndex(null);
            }
          }}
          sizes="(max-width: 700px) 50vw, 25vw"
          src={image.url}
        />
      ))}
    </span>
  );
}

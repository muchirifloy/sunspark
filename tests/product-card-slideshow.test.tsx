import type { ImgHTMLAttributes } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductCardSlideshow } from "@/components/site/product-card-slideshow";

vi.mock("next/image", () => ({
  default: ({ fill: _fill, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => <img {...props} />,
}));

let reportIntersection: ((isIntersecting: boolean) => void) | undefined;

class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    reportIntersection = (isIntersecting) => callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() { return []; }
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0.1];
}

describe("ProductCardSlideshow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    reportIntersection = undefined;
  });

  it("loads each additional image only when its visible slide is due", () => {
    const { container } = render(
      <ProductCardSlideshow
        images={[
          { url: "/first.webp", alt: null },
          { url: "/second.webp", alt: null },
          { url: "/third.webp", alt: null },
        ]}
      />,
    );

    expect(container.querySelectorAll("img")).toHaveLength(1);

    act(() => reportIntersection?.(true));
    act(() => vi.advanceTimersByTime(2600));

    let images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0].classList.contains("is-active")).toBe(true);

    fireEvent.load(images[1]);
    expect(images[1].classList.contains("is-active")).toBe(true);

    act(() => vi.advanceTimersByTime(2600));
    images = container.querySelectorAll("img");
    expect(images).toHaveLength(3);
  });

  it("does not advance while outside the viewport", () => {
    const { container } = render(
      <ProductCardSlideshow
        images={[
          { url: "/first.webp", alt: null },
          { url: "/second.webp", alt: null },
        ]}
      />,
    );

    act(() => vi.advanceTimersByTime(10000));
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});

"use client";

import { useEffect, useState } from "react";

export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector(".site-footer");
    let pastThreshold = window.scrollY > 600;
    let footerVisible = false;

    function sync() {
      setVisible(pastThreshold && !footerVisible);
    }

    function onScroll() {
      pastThreshold = window.scrollY > 600;
      sync();
    }

    window.addEventListener("scroll", onScroll, { passive: true });

    // Hides the button once the footer is reachable instead of only fading it,
    // so it can never sit on top of the footer links while a long product
    // list is loaded below the fold.
    let observer: IntersectionObserver | undefined;
    if (footer) {
      observer = new IntersectionObserver(([entry]) => {
        footerVisible = entry.isIntersecting;
        sync();
      });
      observer.observe(footer);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  return (
    <button
      aria-label="Scroll to top"
      className={`scroll-top-btn${visible ? " is-visible" : ""}`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      tabIndex={visible ? 0 : -1}
      type="button"
    >
      ↑
    </button>
  );
}

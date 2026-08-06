import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddToCartButton } from "@/components/site/add-to-cart-button";
import { CartEditor } from "@/components/site/cart-editor";
import { OrderStatusControls } from "@/components/admin/order-status-controls";

vi.mock("next/image", () => ({
  default: ({ fill: _fill, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => <img {...props} />,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a>,
}));

afterEach(cleanup);

describe("fast client mutations", () => {
  it("adds to cart without replacing the current page", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "Added to cart.", cartCount: 3 });
    render(<AddToCartButton action={action} />);

    fireEvent.click(screen.getByRole("button", { name: "Cart" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Added ✓" })).toBeTruthy());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("optimistically changes cart quantity and confirms it inline", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "Cart updated.", cartCount: 2 });
    render(<CartEditor action={action} initialItems={[{
      imageAlt: "Cable",
      imageUrl: null,
      key: "cable-default",
      name: "Cable",
      optionId: null,
      optionLabel: "Unit",
      priceCents: 50000,
      quantity: 1,
      slug: "cable",
      stockQuantity: 10,
    }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add one Cable" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText("KSH 1,000.00")).toHaveLength(2);
  });

  it("saves only the edited order controls", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: "Order saved without reloading." });
    render(<OrderStatusControls action={action} initialPaymentStatus="UNPAID" initialStatus="PENDING" />);

    fireEvent.change(screen.getByLabelText("Order status"), { target: { value: "PROCESSING" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved ✓" })).toBeTruthy());
    expect(action).toHaveBeenCalledTimes(1);
  });
});

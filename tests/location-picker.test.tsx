import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocationPicker } from "@/components/site/location-picker";

describe("LocationPicker", () => {
  it("keeps checkout usable when Google Maps has not been configured", () => {
    const { container } = render(<LocationPicker apiKey="" />);
    fireEvent.change(screen.getByLabelText("Address or landmark"), { target: { value: "Downtown Tower, Nairobi" } });

    expect(container.querySelector<HTMLInputElement>('input[name="deliveryLocation"]')?.value).toBe("Downtown Tower, Nairobi");
    expect(container.querySelector<HTMLInputElement>('input[name="deliveryMapUrl"]')?.value).toContain("google.com/maps/search");
    expect(screen.getByRole("link", { name: "Open exact point in Google Maps" }).getAttribute("href")).toContain("Downtown%20Tower");
  });
});

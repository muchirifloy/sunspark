"use client";

import { useMemo, useState, useTransition } from "react";
import { announceCartCount } from "@/components/site/cart-events";
import type { ActionResult } from "@/lib/actions/result";
import { formatMoney } from "@/lib/money";
import { sellingUnitLabel } from "@/lib/products/units";
import type { ProductOption, SellingUnit } from "@/lib/types";

type ProductOptionPurchaseProps = {
  action: (formData: FormData) => Promise<ActionResult>;
  disabled?: boolean;
  options: ProductOption[];
};

function fallbackLabel(unit: SellingUnit) {
  return sellingUnitLabel(unit).replace(/^./, (letter) => letter.toUpperCase());
}

export function ProductOptionPurchase({ action, disabled = false, options }: ProductOptionPurchaseProps) {
  const defaultOption = useMemo(() => options.find((option) => option.isDefault) ?? options[0], [options]);
  const [selectedId, setSelectedId] = useState(defaultOption?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const selected = options.find((option) => option.id === selectedId) ?? defaultOption;

  if (!selected) {
    return null;
  }

  return (
    <form className="product-option-purchase" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setMessage("");
      startTransition(async () => {
        const result = await action(formData);
        setMessage(result.message);
        if (result.ok && result.cartCount !== undefined) announceCartCount(result.cartCount);
      });
    }}>
      <label>
        Buy as
        <select name="optionId" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
          {options.map((option) => (
            <option key={option.id || `${option.sellingUnit}-${option.priceCents}`} value={option.id}>
              {option.label || fallbackLabel(option.sellingUnit)}
            </option>
          ))}
        </select>
      </label>
      <div className="detail-price option-price">
        <strong>{formatMoney(selected.priceCents)} / {sellingUnitLabel(selected.sellingUnit)}</strong>
        {selected.compareAtCents ? <span>{formatMoney(selected.compareAtCents)}</span> : null}
      </div>
      <button aria-busy={isPending} className="primary-btn" disabled={disabled || isPending} type="submit">{isPending ? "Adding..." : "Add to cart"}</button>
      {message ? <p className={message === "Added to cart." ? "inline-action-success" : "inline-action-error"} role="status">{message}</p> : null}
    </form>
  );
}

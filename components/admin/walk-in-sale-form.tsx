"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/result";
import type { SaleProduct } from "@/lib/types";

type SaleLine = {
  productId: string;
  productOptionId?: string | null;
  quantity: number;
  // Undefined means "use the catalogue price". A number here is a negotiated
  // price for this sale only -- it never writes back to the product.
  unitCents?: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(cents / 100);
}

export function WalkInSaleForm({
  action,
  initialCustomer,
  initialLines = [],
  products,
  submitLabel = "Complete sale"
}: {
  action: (formData: FormData) => Promise<ActionResult | void>;
  initialCustomer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    paymentMethod?: "CASH" | "MPESA" | "WHATSAPP" | string | null;
  };
  initialLines?: SaleLine[];
  products: SaleProduct[];
  submitLabel?: string;
}) {
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();
  const [lines, setLines] = useState<SaleLine[]>(initialLines);
  const choices = useMemo(() => products.flatMap((product) => {
    const options = product.options?.length ? product.options : [{
      id: "",
      productId: product.id,
      label: "Unit",
      sellingUnit: "UNIT" as const,
      priceCents: product.priceCents,
      compareAtCents: null,
      costCents: 0,
      stockMultiplier: 1,
      isDefault: true,
      sortOrder: 0,
      createdAt: "",
      updatedAt: ""
    }];
    return options.map((option) => ({ product, option, key: `${product.id}::${option.id}` }));
  }), [products]);
  const [productQuery, setProductQuery] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const choiceByKey = useMemo(() => new Map(choices.map((choice) => [choice.key, choice])), [choices]);
  const matchingChoices = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const matches = query
      ? choices.filter(({ product, option }) => `${product.name} ${option.label}`.toLowerCase().includes(query))
      : choices;
    return matches.slice(0, 10);
  }, [choices, productQuery]);
  const total = lines.reduce((sum, line) => {
    const product = productById.get(line.productId);
    const option = product?.options?.find((item) => item.id === line.productOptionId) ?? product?.options?.find((item) => item.isDefault);
    const listPrice = option?.priceCents ?? product?.priceCents ?? 0;
    return sum + (line.unitCents ?? listPrice) * line.quantity;
  }, 0);

  function addLine(choiceKey: string) {
    const choice = choiceByKey.get(choiceKey);
    if (!choice) return;
    const { product, option } = choice;
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id && (line.productOptionId ?? "") === option.id);
      if (existing) {
        return current.map((line) => line.productId === product.id && (line.productOptionId ?? "") === option.id ? { ...line, quantity: Math.min(line.quantity + 1, product.stockQuantity) } : line);
      }
      return [...current, { productId: product.id, productOptionId: option.id || null, quantity: 1 }];
    });
    setProductQuery("");
    setIsPickerOpen(false);
    setFormError("");
  }

  return (
    <form className="walk-in-sale-form" onSubmit={(event) => {
      event.preventDefault();
      if (!lines.length) {
        setFormError("Add at least one product before completing the sale.");
        return;
      }
      const formData = new FormData(event.currentTarget);
      setFormError("");
      startTransition(async () => {
        const result = await action(formData);
        if (!result) return;
        if (!result.ok) {
          setFormError(result.message);
          return;
        }
        if (result.redirectTo) router.push(result.redirectTo);
      });
    }}>
      <section className="sale-panel">
        <div className="sale-panel-heading"><h2>Customer</h2><p>Capture the details needed for the receipt.</p></div>
        <div className="form-grid two">
          <label>Customer name<input defaultValue={initialCustomer?.name ?? ""} name="customerName" placeholder="Walk-in customer" required /></label>
          <label>Phone number<input defaultValue={initialCustomer?.phone ?? ""} name="customerPhone" inputMode="tel" placeholder="Optional" /></label>
        </div>
        <label>Email address<input defaultValue={initialCustomer?.email ?? ""} name="customerEmail" placeholder="Optional - useful for emailed invoices" type="email" /></label>
        <label>Payment method
          <select defaultValue={initialCustomer?.paymentMethod ?? "CASH"} name="paymentMethod"><option value="CASH">Cash</option><option value="MPESA">M-Pesa</option><option value="WHATSAPP">WhatsApp</option></select>
        </label>
      </section>
      <section className="sale-panel">
        <div className="sale-panel-heading"><h2>Products</h2><p>Only products with stock are shown.</p></div>
        <div
          className="sale-product-picker sale-product-combobox"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPickerOpen(false);
          }}
        >
          <label className="sale-search-field">
            <span>Find product</span>
            <input
              aria-autocomplete="list"
              aria-controls="walk-in-product-suggestions"
              aria-expanded={isPickerOpen}
              aria-label="Search walk-in products"
              autoComplete="off"
              onChange={(event) => { setProductQuery(event.target.value); setIsPickerOpen(true); }}
              onFocus={() => setIsPickerOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && isPickerOpen && matchingChoices[0]) {
                  event.preventDefault();
                  addLine(matchingChoices[0].key);
                }
                if (event.key === "Escape") setIsPickerOpen(false);
              }}
              placeholder="Type a product name..."
              role="combobox"
              type="search"
              value={productQuery}
            />
          </label>
          {isPickerOpen ? (
            <div className="sale-product-suggestions" id="walk-in-product-suggestions" role="listbox">
              {matchingChoices.map(({ product, option, key }) => (
                <button aria-selected="false" key={key} onClick={() => addLine(key)} role="option" type="button">
                  <span><strong>{product.name}</strong><small>{option.label} · {money(option.priceCents)}</small></span>
                  <em>{product.stockQuantity} available</em>
                  <b>Add</b>
                </button>
              ))}
              {!matchingChoices.length ? <p>No matching products.</p> : null}
            </div>
          ) : null}
        </div>
        <div className="sale-lines" aria-live="polite">
          {lines.map((line) => {
            const product = productById.get(line.productId);
            if (!product) return null;
            const option = product.options?.find((item) => item.id === line.productOptionId) ?? product.options?.find((item) => item.isDefault);
            const lineKey = `${product.id}-${option?.id ?? "default"}`;
            const listPrice = option?.priceCents ?? product.priceCents;
            const unitPrice = line.unitCents ?? listPrice;
            const isNegotiated = unitPrice !== listPrice;
            const matches = (item: SaleLine) => item.productId === product.id && (item.productOptionId ?? "") === (option?.id ?? "");
            return <div className="sale-line" key={lineKey}>
              <input name="productId" type="hidden" value={product.id} />
              <input name="productOptionId" type="hidden" value={option?.id ?? ""} />
              {/* Submitted in cents so no rounding happens between the shown
                  price and the stored one. */}
              <input name="unitCents" type="hidden" value={unitPrice} />
              <span>
                <strong>{product.name}</strong>
                <small>
                  {option?.label ? `${option.label} · ` : ""}
                  {isNegotiated ? <>list {money(listPrice)}</> : <>{money(listPrice)} each</>}
                </small>
              </span>
              <label className="sale-line-price">
                <span className="visually-hidden">{`${product.name} unit price`}</span>
                <input
                  aria-label={`${product.name} unit price in shillings`}
                  className={isNegotiated ? "negotiated" : undefined}
                  min="0"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    setLines((current) => current.map((item) => {
                      if (!matches(item)) return item;
                      // Clearing the box restores the catalogue price rather than
                      // pinning the line to zero.
                      if (raw === "") return { ...item, unitCents: undefined };
                      const shillings = Number(raw);
                      if (!Number.isFinite(shillings) || shillings < 0) return item;
                      return { ...item, unitCents: Math.round(shillings * 100) };
                    }));
                  }}
                  step="1"
                  type="number"
                  value={unitPrice / 100}
                />
              </label>
              <input aria-label={`${product.name} quantity`} max={product.stockQuantity} min="1" name="quantity" onChange={(event) => setLines((current) => current.map((item) => matches(item) ? { ...item, quantity: Math.max(1, Math.min(product.stockQuantity, Number(event.target.value) || 1)) } : item))} type="number" value={line.quantity} />
              <strong>{money(unitPrice * line.quantity)}</strong>
              <button aria-label={`Delete ${product.name} from sale`} className="remove-line" onClick={() => setLines((current) => current.filter((item) => !matches(item)))} type="button">Delete</button>
            </div>;
          })}
          {!lines.length ? <p className="empty-state">No products added to this sale.</p> : null}
        </div>
      </section>
      {formError ? <p className="admin-feedback error" role="alert">{formError}</p> : null}
      <div className="sale-total"><span>Total</span><strong>{money(total)}</strong><button aria-busy={isSubmitting} className="primary-btn" disabled={!lines.length || isSubmitting} type="submit">{isSubmitting ? `${submitLabel.replace(/^Create /, "Creating ").replace(/^Complete /, "Completing ")}...` : submitLabel}</button></div>
    </form>
  );
}

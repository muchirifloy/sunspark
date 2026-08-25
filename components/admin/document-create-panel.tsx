"use client";

import { useState } from "react";
import { WalkInSaleForm } from "@/components/admin/walk-in-sale-form";
import type { ActionResult } from "@/lib/actions/result";
import type { SaleProduct } from "@/lib/types";

export type CreateMode = "" | "invoice" | "quotation";

/**
 * Opening the create panel used to be a navigation to `?create=invoice`, which
 * re-ran the whole page on the server -- auth, the document list, the product
 * catalogue and the layout's pending-order count -- just to reveal a panel whose
 * data was already on the page. It is plain UI state, so it lives here now and
 * the toggle costs nothing.
 *
 * `initialMode` still seeds from the URL so existing links and the actions'
 * error redirects keep working.
 */
export function DocumentCreatePanel({
  createInvoiceAction,
  createQuotationAction,
  initialMode = "",
  products
}: {
  createInvoiceAction: (formData: FormData) => Promise<ActionResult | void>;
  createQuotationAction: (formData: FormData) => Promise<ActionResult | void>;
  initialMode?: CreateMode;
  products: SaleProduct[];
}) {
  const [mode, setMode] = useState<CreateMode>(initialMode);
  const isQuotation = mode === "quotation";

  return (
    <>
      <div className="document-create-actions">
        <button
          aria-expanded={mode === "invoice"}
          className={mode === "invoice" ? "primary-btn" : "secondary-btn"}
          onClick={() => setMode((current) => (current === "invoice" ? "" : "invoice"))}
          type="button"
        >
          Create invoice
        </button>
        <button
          aria-expanded={isQuotation}
          className={isQuotation ? "primary-btn" : "secondary-btn"}
          onClick={() => setMode((current) => (current === "quotation" ? "" : "quotation"))}
          type="button"
        >
          Create quotation
        </button>
      </div>
      {mode ? (
        <section className="document-editor-panel">
          <div className="document-editor-heading">
            <div>
              <p className="eyebrow">{isQuotation ? "Quotation" : "Invoice"}</p>
              <h2>{isQuotation ? "Create customer quotation" : "Create draft invoice"}</h2>
            </div>
            <button className="table-link" onClick={() => setMode("")} type="button">
              Close
            </button>
          </div>
          {/* Remounting per mode keeps a half-filled invoice from leaking into a
              quotation when the admin switches tabs. */}
          <WalkInSaleForm
            action={isQuotation ? createQuotationAction : createInvoiceAction}
            key={mode}
            products={products}
            submitLabel={isQuotation ? "Create quotation" : "Create invoice"}
          />
        </section>
      ) : null}
    </>
  );
}

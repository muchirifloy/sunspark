import { checkoutAction } from "@/app/checkout/actions";
import { LocationPicker } from "@/components/site/location-picker";
import { AsyncSubmitForm } from "@/components/ui/async-submit-form";
import { preventAdminShopping } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { apiFetch } from "@/lib/api/client";
import { getCart } from "@/lib/cart/cart-service";
import { formatMoney } from "@/lib/money";
import type { PublicUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  await preventAdminShopping();
  const [cart, session] = await Promise.all([getCart(), getSession()]);
  const customer = session ? await apiFetch<PublicUser>(`/users/${session.id}`).catch(() => null) : null;

  return (
    <section className="section">
      <div className="container checkout-layout">
        <div>
          <div className="section-title">
            <h3>Checkout</h3>
          </div>
          <AsyncSubmitForm action={checkoutAction} buttonLabel="Place order" className="admin-form" disabled={!cart.items.length} pendingLabel="Submitting order...">
            <label>
              Name
              <input name="customerName" defaultValue={customer?.name ?? ""} required />
            </label>
            <label>
              Email
              <input name="customerEmail" defaultValue={customer?.email ?? ""} type="email" required />
            </label>
            <label>
              Phone
              <input name="customerPhone" defaultValue={customer?.phone ?? ""} />
            </label>
            <label>
              Delivery note
              <textarea name="deliveryNote" rows={4} />
            </label>
            <LocationPicker apiKey={process.env.GOOGLE_MAPS_BROWSER_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""} />
            <label>
              Payment method
              <select name="paymentMethod" defaultValue="WHATSAPP">
                <option value="WHATSAPP">WhatsApp checkout</option>
              </select>
            </label>
          </AsyncSubmitForm>
        </div>
        <aside className="order-summary">
          <h2>Order Summary</h2>
          {cart.items.map((item) => (
            <div className="summary-line" key={`${item.product.id}-${item.option?.id ?? "default"}`}>
              <span>
                {item.product.name}{item.option ? ` - ${item.option.label}` : ""} x{item.quantity}
              </span>
              <strong>{formatMoney(item.lineTotalCents)}</strong>
            </div>
          ))}
          <div className="summary-line total">
            <span>Total</span>
            <strong>{formatMoney(cart.subtotalCents)}</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}

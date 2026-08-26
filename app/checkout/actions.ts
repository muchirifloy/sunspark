"use server";

import type { PaymentMethod } from "@/lib/types";
import type { ActionResult } from "@/lib/actions/result";
import { buildWhatsAppCheckoutUrl } from "@/lib/checkout/whatsapp";
import { preventAdminShopping } from "@/lib/auth/guards";
import { formatMoney } from "@/lib/money";
import { createOrderFromCart } from "@/lib/orders/order-service";
import { siteConfig } from "@/lib/site-config";

export async function checkoutAction(formData: FormData): Promise<ActionResult> {
  try {
    await preventAdminShopping();
    const paymentMethod = String(formData.get("paymentMethod") ?? "WHATSAPP") as PaymentMethod;
    const customerPhone = String(formData.get("customerPhone") ?? "").trim();
    // Checked here as well as in the browser and the API: every order now triggers a
    // confirmation text, and a number that cannot receive one is a customer who hears
    // nothing until somebody notices the order by hand.
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(customerPhone.replace(/[\s-]/g, ""))) {
      return { ok: false, message: "Enter a valid Kenyan mobile number, for example 0712345678. We text your order updates to it." };
    }
    const order = await createOrderFromCart({
      customerName: String(formData.get("customerName") ?? "").trim(),
      customerEmail: String(formData.get("customerEmail") ?? "").trim(),
      customerPhone,
      deliveryNote: String(formData.get("deliveryNote") ?? "").trim(),
      deliveryLocation: String(formData.get("deliveryLocation") ?? "").trim(),
      deliveryMapUrl: String(formData.get("deliveryMapUrl") ?? "").trim(),
      deliveryLatitude: String(formData.get("deliveryLatitude") ?? "").trim(),
      deliveryLongitude: String(formData.get("deliveryLongitude") ?? "").trim(),
      paymentMethod,
    });

    if (paymentMethod === "WHATSAPP") {
      return { ok: true, message: "Order placed.", redirectTo: buildWhatsAppCheckoutUrl({
        phone: siteConfig.whatsappPhone,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        deliveryNote: order.deliveryNote ?? undefined,
        deliveryLocation: order.deliveryLocation ?? undefined,
        deliveryMapUrl: order.deliveryMapUrl ?? undefined,
        totalLabel: formatMoney(order.totalCents),
        items: order.items.map((item) => ({ name: item.productName, quantity: item.quantity }))
      }) };
    }
    return { ok: true, message: "Order placed.", redirectTo: `/account/orders/${order.id}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, message: message.includes("empty") ? "Your cart is empty. Add a product before checking out." : "Checkout could not be completed. No duplicate order was created; please review the details and try again." };
  }
}

export const cartCountEvent = "sunspark:cart-count";

export function announceCartCount(cartCount: number) {
  window.dispatchEvent(new CustomEvent<number>(cartCountEvent, { detail: cartCount }));
}

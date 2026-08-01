// Fired on window whenever something is added to the basket, so the header —
// which owns the basket drawer — slides it open as the confirmation, instead
// of each add-to-cart button printing its own "Added" message. Same
// custom-event pattern as COOKIE_CONSENT_CHANGED_EVENT: the dispatchers
// (ProductCard, AddToCartForm) and the listener (ShopHeader) live in
// different parts of the tree, and a window event is lighter than threading
// drawer state through the cart context, which holds data, not UI.
export const OPEN_BASKET_EVENT = "cb-open-basket";

export function requestOpenBasket() {
  window.dispatchEvent(new Event(OPEN_BASKET_EVENT));
}

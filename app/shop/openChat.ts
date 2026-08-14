// Fired on window when something elsewhere in the app wants Riley open.
//
// Same custom-event pattern, and the same reason, as OPEN_BASKET_EVENT next
// door: the panel's open state belongs to ChatWidget, the account's
// "Customer Service" row is in a different part of the tree, and a window
// event is lighter than lifting that state into a context every shop page
// would then subscribe to.
//
// Deliberately not a route. Riley is a panel over whatever you were doing, and
// sending somebody to /chat to ask a question would lose the page they had a
// question about.
export const OPEN_CHAT_EVENT = "cb-open-chat";

export function requestOpenChat() {
  window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
}

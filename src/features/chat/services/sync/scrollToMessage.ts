type ScrollToMessageListener = (info: {
  conversationId: number;
  messageId: number;
}) => void;
const listeners = new Set<ScrollToMessageListener>();

/**
 * Subscribe to "scroll to message" events. Chat screens use this to jump to a
 * highlighted message when the user taps a search result while the chat is
 * already mounted lower in the navigation stack.
 */
export function onScrollToMessage(listener: ScrollToMessageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Tell any mounted chat screen to scroll to (and highlight) a message. Used by
 * the message-search screen right before dismissing back into the chat.
 */
export function emitScrollToMessage(conversationId: number, messageId: number) {
  listeners.forEach((listener) =>
    listener({ conversationId: Number(conversationId), messageId: Number(messageId) }),
  );
}
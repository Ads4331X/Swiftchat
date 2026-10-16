import { api } from "@/core/api";
import {
  clearChatLocalMessages,
  clearConversationPreview,
  setConversationClearedAt,
} from "@/core/db";

type ClearChatListener = (info: { conversationId: number }) => void;
const listeners = new Set<ClearChatListener>();

/**
 * Subscribe to chat-cleared events. The chat list and individual chat screens
 * use this to reset their in-memory state (preview + message list) when a
 * conversation is cleared from anywhere in the app (swipe action, profile).
 */
export function onChatCleared(listener: ClearChatListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Clear a conversation: tell the server (marks clearedAt so future message /
 * conversation fetches filter it out), wipe the local preview and message
 * cache, and notify every mounted screen that holds that conversation's state.
 */
export async function clearChat(conversationId: number) {
  const res = await api.post(`/api/conversations/${conversationId}/clear`);

  await setConversationClearedAt({
    conversationId: Number(conversationId),
    clearedAt: String(res.data.clearedAt),
  });
  await clearConversationPreview(Number(conversationId));
  await clearChatLocalMessages(Number(conversationId));

  listeners.forEach((listener) =>
    listener({ conversationId: Number(conversationId) }),
  );

  return res.data;
}
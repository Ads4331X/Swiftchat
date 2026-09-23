/**
 * Tracks which conversation is currently open on screen. The `useChats`
 * `new-message` listener uses this to avoid bumping the unread badge for the
 * chat the user is actively reading (that chat gets its read state from
 * MessageList's mark-read instead).
 */
let activeConversationId: number | null = null;

export function setActiveConversation(conversationId: number | null) {
  activeConversationId = conversationId;
}

export function getActiveConversation(): number | null {
  return activeConversationId;
}
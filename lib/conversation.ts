export type ConversationMemberLike = {
  id: number;
  username: string;
};

/**
 * Single consistent rule for displaying a conversation's title.
 *
 * 1. If the conversation has a custom name, show it.
 * 2. Otherwise, if exactly one other member exists, show that member's name.
 * 3. Otherwise, fall back to the joined member names (or a generic title).
 *
 * `members` should be the OTHER participants (the current user excluded),
 * so a 1-to-1 conversation with a custom name keeps it, and one without
 * a custom name shows the other person's name.
 */
export function conversationDisplayName(
  customName?: string | null,
  members: ConversationMemberLike[] = [],
): string {
  const trimmed = customName?.trim();
  if (trimmed) return trimmed;

  const names = members.map((m) => m.username);
  if (names.length === 1) return names[0] || "Chat";
  if (names.length > 1) return names.filter(Boolean).join(", ");
  return "Chat";
}
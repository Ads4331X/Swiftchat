import { type MessageReaction } from "@/features/chat/hooks/useChatMessages";

/** Color for the WhatsApp-style double-check "read" ticks on own messages. */
export const READ_TICK_COLOR = "#4FC3F7";

export function formatBubbleTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Group a message's reactions by emoji into `{ emoji, count }` summaries for
 * the chip row. Order is preserved by first appearance.
 */
export function groupReactions(
  reactions?: MessageReaction[],
): { emoji: string; count: number }[] {
  if (!reactions || reactions.length === 0) return [];
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const r of reactions) {
    if (!counts.has(r.emoji)) {
      counts.set(r.emoji, 0);
      order.push(r.emoji);
    }
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  }
  return order.map((emoji) => ({ emoji, count: counts.get(emoji) ?? 0 }));
}

/**
 * WhatsApp-style per-sender accent colors for group reply quotes, so a reply
 * to Alice vs. a reply to Bob is visually distinct without relying on names.
 */
const SENDER_ACCENTS = [
  "#06D6A0",
  "#F2994A",
  "#EF476F",
  "#8338EC",
  "#3A86FF",
  "#EC4899",
];

export function accentForSender(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash << 5) - hash + name.charCodeAt(i);
  return SENDER_ACCENTS[Math.abs(hash) % SENDER_ACCENTS.length];
}

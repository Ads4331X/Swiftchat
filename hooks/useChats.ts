import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { listenForNewMessages, joinConversations } from "@/lib/socket";
import {
  getConversations,
  saveConversation,
  updateConversationPreview,
} from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
export type ChatMember = {
  id: number;
  username: string;
  avatar?: string;
};

export type Chat = {
  id: number;
  members: ChatMember[];
  lastMessage?: {
    id: number;
    text: string;
    sentAt: string;
    senderId: number;
  } | null;
};

function dedupe(chats: Chat[]): Chat[] {
  const seen = new Set<string>();
  return chats.filter((chat) => {
    const key = chat.members
      .map((m) => m.id)
      .sort((a, b) => a - b)
      .join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listenForNewMessages((message) => {
      setChats((currentChats) => {
        const chat = currentChats.find((c) => c.id === message.conversationId);
        if (!chat) return currentChats;
        const updatedChat = {
          ...chat,
          lastMessage: message,
        };
        // Keep the local Conversation cache in sync so refetch() (which shows
        // cached rows first, then the server rows) doesn't flash the stale
        // preview/ordering for a moment before it settles.
        updateConversationPreview({
          id: message.conversationId,
          lastMessageText: message.text,
          lastMessageSentAt: message.sentAt,
        }).catch(() => {});
        const otherChats = currentChats.filter((c) => c.id !== chat.id);
        return [updatedChat, ...otherChats];
      });
    });
  }, []);

  const refetch = useCallback(async () => {
    if (chats.length === 0) setLoading(true);
    try {
      const currentUserId = await getCurrentUserId();
      try {
        const cache = await getConversations();
        if (cache.length) setChats(cache);
      } catch {
        // cache unavailable (e.g. web OPFS locked); fall through to server
      }
      const response = await api.get(`/api/conversations`);
      const fetched = dedupe(response.data);
      setChats(fetched);
      joinConversations(fetched.map((chat) => chat.id));

      fetched.forEach((chat) => {
        const otherMember = chat.members.find((m) => m.id !== currentUserId);
        saveConversation({
          id: chat.id,
          otherUsername: otherMember?.username ?? "Unknown",
          otherAvatarUrl: otherMember?.avatar ?? "",
          lastMessageText: chat.lastMessage?.text ?? "",
          lastMessageSentAt: chat.lastMessage?.sentAt ?? "",
        }).catch(() => {});
      });
    } finally {
      setLoading(false);
    }
  }, [chats.length]);

  return { chats, loading, refetch };
}

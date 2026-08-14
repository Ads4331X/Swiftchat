import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { listenForNewMessages, joinConversations } from "@/lib/socket";

export type ChatMember = {
  id: number;
  username: string;
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
        const otherChats = currentChats.filter((c) => c.id !== chat.id);
        return [updatedChat, ...otherChats];
      });
    });
  }, []);

  const refetch = useCallback(async () => {
    if (chats.length === 0) setLoading(true);
    try {
      const response = await api.get(`/api/conversations`);
      const fetched = dedupe(response.data);
      setChats(fetched);
      joinConversations(fetched.map((chat) => chat.id));
    } finally {
      setLoading(false);
    }
  }, [chats.length]);

  return { chats, loading, refetch };
}

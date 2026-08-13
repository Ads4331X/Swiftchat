import { useState, useCallback } from "react";
import { api } from "@/lib/api";

export type ChatMember = {
  id: number;
  username: string;
};

export type Chat = {
  id: number;
  members: ChatMember[];
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

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/api/conversations`);
      setChats(dedupe(response.data));
    } finally {
      setLoading(false);
    }
  }, []);

  return { chats, loading, refetch };
}

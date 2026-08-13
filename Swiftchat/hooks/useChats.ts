import { useState, useEffect } from "react";
import { api } from "@/lib/api";

type ChatMember = {
  userId: number;
};

type Chat = {
  id: number;
  members: ChatMember[];
};

export default function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchChatLists() {
      const lists = await api.get(`/api/conversations`);
      setChats(lists.data);
      setLoading(false);
    }

    fetchChatLists();
  }, []);

  return { chats, loading };
}

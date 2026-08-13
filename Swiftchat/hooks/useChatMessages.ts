import { api } from "@/lib/api";
import { useState, useEffect } from "react";

export type Message = {
  id: number;
  text: string;
  sentAt: string;
  editedAt: string;
  senderId: number;
  conversationId: number;
};

export default function useChatMessages(id: string | number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    let active = true;

    const getMessages = async () => {
      setLoading(true);
      try {
        const response = await api.get(
          `/api/conversations/messages/${id}?limit=30`,
        );
        if (active) {
          setMessages(response.data);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    getMessages();

    return () => {
      active = false;
    };
  }, [id]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const response = await api.post(`/api/conversations/messages`, {
      messageText: text,
      conversationId: Number(id),
    });
    setMessages((prev) => [...prev, response.data]);
  };

  return { messages, loading, sendMessage };
}

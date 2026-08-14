import { api } from "@/lib/api";
import {
  connectSocket,
  joinConversation,
  listenForMessageDeletes,
  listenForMessageUpdates,
  listenForNewMessages,
} from "@/lib/socket";
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

    const init = async () => {
      await connectSocket();

      if (!active) return;

      joinConversation({ id: String(id) });

      const unsubscribeNewMessage = listenForNewMessages((newMessage) => {
        setMessages((currentMsg) => {
          if (newMessage.conversationId !== Number(id)) {
            return currentMsg;
          }

          const existingMessage = currentMsg.find(
            (message) => message.id === newMessage.id,
          );

          if (existingMessage) {
            return currentMsg;
          }

          return [...currentMsg, newMessage];
        });
      });

      const unsubscribeMessageUpdate = listenForMessageUpdates(
        (updatedMessage) => {
          setMessages((currentMsg) =>
            currentMsg.map((message) =>
              message.id === updatedMessage.id ? updatedMessage : message,
            ),
          );
        },
      );

      const unsubscribeMessageDelete = listenForMessageDeletes(
        ({ id: deletedId }) => {
          setMessages((currentMsg) =>
            currentMsg.filter((message) => message.id !== deletedId),
          );
        },
      );

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
        unsubscribeNewMessage && unsubscribeNewMessage();
        unsubscribeMessageUpdate && unsubscribeMessageUpdate();
        unsubscribeMessageDelete && unsubscribeMessageDelete();
      };
    };

    let cleanupFn: (() => void) | void;

    init().then((c) => {
      if (typeof c === "function") cleanupFn = c as () => void;
    });

    return () => {
      active = false;
      if (cleanupFn) cleanupFn();
    };
  }, [id]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const response = await api.post(`/api/conversations/messages`, {
      messageText: text,
      conversationId: Number(id),
    });
    setMessages((prev) =>
      prev.some((message) => message.id === response.data.id)
        ? prev
        : [...prev, response.data],
    );
  };

  return { messages, loading, sendMessage };
}

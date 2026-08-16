import { api } from "@/lib/api";
import {
  connectSocket,
  joinConversation,
  listenForMessageDeletes,
  listenForMessageUpdates,
  listenForNewMessages,
} from "@/lib/socket";
import { useState, useEffect, useRef } from "react";

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
  const tempIdRef = useRef(-1); // negative ids for optimistic (not-yet-confirmed) messages

  useEffect(() => {
    if (!id) return;
    let active = true;

    const init = async () => {
      await connectSocket();

      if (!active) return;

      joinConversation({ id: String(id) });

      const unsubscribeNewMessage = listenForNewMessages((newMessage) => {
        // Compare as numbers on both sides — the socket payload's
        // conversationId can come through as a string depending on how the
        // server serializes it, and a strict !== here silently drops every
        // incoming real-time message if the types don't match.
        if (Number(newMessage.conversationId) !== Number(id)) {
          return;
        }

        setMessages((currentMsg) => {
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
          if (Number(updatedMessage.conversationId) !== Number(id)) return;

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
    const trimmed = text.trim();
    if (!trimmed) return;

    // Optimistic bubble so the message appears instantly, before the
    // network round trip completes.
    const tempId = tempIdRef.current--;
    const optimisticMessage: Message = {
      id: tempId,
      text: trimmed,
      sentAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      senderId: -1, // replaced once the real response comes back
      conversationId: Number(id),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const response = await api.post(`/api/conversations/messages`, {
        messageText: trimmed,
        conversationId: Number(id),
      });

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== tempId);
        const alreadyPresent = withoutOptimistic.some(
          (m) => m.id === response.data.id,
        );
        return alreadyPresent
          ? withoutOptimistic
          : [...withoutOptimistic, response.data];
      });
    } catch (err) {
      // Roll back the optimistic bubble if the send actually failed
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    }
  };

  return { messages, loading, sendMessage };
}

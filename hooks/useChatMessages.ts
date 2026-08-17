import { api } from "@/lib/api";
import {
  deleteMsg,
  readMsgs,
  saveMessage,
  updateConversationPreview,
  updateMsg,
} from "@/lib/db";
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
  // tempId -> text of every optimistic message that is still waiting for the
  // server to confirm it. Used to recognise the socket echo of our own send
  // so it replaces the temp bubble in place instead of appending a duplicate.
  const pendingRef = useRef(new Map<number, string>());

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
        updateConversationPreview({
          id: Number(id),
          lastMessageText: newMessage.text,
          lastMessageSentAt: newMessage.sentAt,
        }).catch(() => {});
        saveMessage({
          messageId: newMessage.id,
          message: newMessage.text,
          sentAt: newMessage.sentAt,
          SenderId: newMessage.senderId,
          ConversationId: newMessage.conversationId,
        }).catch(() => {});
        setMessages((currentMsg) => {
          const existingMessage = currentMsg.find(
            (message) => message.id === newMessage.id,
          );

          if (existingMessage) {
            return currentMsg;
          }

          // If this is the server's echo of a message we optimistically
          // rendered (we're the sender), swap the temp bubble for the real one
          // in place. Otherwise the temp + real bubble briefly coexist and the
          // list visibly jumps up/down when the temp is removed.
          for (const [tempId, text] of pendingRef.current) {
            if (text === newMessage.text) {
              pendingRef.current.delete(tempId);
              return currentMsg.map((message) =>
                message.id === tempId ? newMessage : message,
              );
            }
          }

          return [...currentMsg, newMessage];
        });
      });

      const unsubscribeMessageUpdate = listenForMessageUpdates(
        (updatedMessage) => {
          if (Number(updatedMessage.conversationId) !== Number(id)) return;
          updateMsg({
            messageId: Number(updatedMessage.id),
            message: updatedMessage.text,
            editedAt: String(new Date()),
          }).catch(() => {});

          setMessages((currentMsg) =>
            currentMsg.map((message) =>
              message.id === updatedMessage.id ? updatedMessage : message,
            ),
          );
        },
      );

      const unsubscribeMessageDelete = listenForMessageDeletes(
        ({ id: deletedId }) => {
          deleteMsg({ messageId: Number(deletedId) }).catch(() => {});
          setMessages((currentMsg) =>
            currentMsg.filter((message) => message.id !== deletedId),
          );
        },
      );

      const getMessages = async () => {
        setLoading(true);
        try {
          let cache: Message[] = [];
          try {
            cache = (await readMsgs({
              conversationId: Number(id),
            })) as Message[];
          } catch {
            // cache unavailable (e.g. web OPFS locked); fall through to server
          }
          if (active && cache.length > 0) {
            setMessages(cache);
            setLoading(false);
          }
          const response = await api.get(
            `/api/conversations/messages/${id}?limit=30`,
          );

          if (active) {
            setMessages(response.data);
          }

          response.data.forEach((msg: Message) => {
            saveMessage({
              messageId: Number(msg.id),
              message: msg.text,
              sentAt: String(msg.sentAt),
              ConversationId: Number(msg.conversationId),
              SenderId: Number(msg.senderId),
            }).catch(() => {});
          });
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

  const editMessage = async (messageId: string | number, text: string) => {
    const editedMsg = await api.patch(
      `/api/conversations/messages/${messageId}`,
      {
        text: text,
      },
    );
    await updateMsg({
      messageId: Number(messageId),
      editedAt: String(new Date().toISOString()),
      message: text,
    });
  };

  const deleteMessage = async (messageId: string | number) => {
    const deletedMsg = await api.delete(
      `/api/conversations/messages/${messageId}`,
    );
    await deleteMsg({ messageId: Number(messageId) });
  };
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Optimistic bubble so the message appears instantly, before the
    // network round trip completes.
    const tempId = tempIdRef.current--;
    pendingRef.current.set(tempId, trimmed);
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

      pendingRef.current.delete(tempId);

      saveMessage({
        messageId: Number(response.data.id),
        message: response.data.text,
        sentAt: response.data.sentAt,
        SenderId: response.data.senderId,
        ConversationId: response.data.conversationId,
      }).catch(() => {});
      updateConversationPreview({
        id: Number(id),
        lastMessageText: response.data.text,
        lastMessageSentAt: response.data.sentAt,
      }).catch(() => {});
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
      pendingRef.current.delete(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    }
  };

  {
    return { messages, loading, sendMessage, editMessage, deleteMessage };
  }
}

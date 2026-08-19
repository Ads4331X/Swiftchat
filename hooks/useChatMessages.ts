import { api } from "@/lib/api";
import {
  deleteMsg,
  readMsgs,
  readMsgsPaginated,
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
import { useState, useEffect, useRef, useCallback } from "react";

export type Message = {
  id: number;
  text: string;
  sentAt: string;
  editedAt: string;
  senderId: number;
  conversationId: number;
};

const PAGE_SIZE = 50;

export default function useChatMessages(
  id: string | number,
  currentUserId: number | null,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const tempIdRef = useRef(-1);
  const pendingRef = useRef(new Map<number, string>());
  const fetchedServerRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let active = true;

    // Reset state when conversation changes
    fetchedServerRef.current = false;
    setHasMore(true);

    const init = async () => {
      await connectSocket();

      if (!active) return;

      joinConversation({ id: String(id) });

      const unsubscribeNewMessage = listenForNewMessages((newMessage) => {
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
          // 1. Load from local cache first (instant display)
          let cache: Message[] = [];
          try {
            cache = (await readMsgsPaginated({
              conversationId: Number(id),
              limit: 200,
            })) as Message[];
          } catch {
            // cache unavailable
          }
          if (active && cache.length > 0) {
            setMessages(cache);
            setLoading(false);
          }

          // 2. Fetch latest messages from server
          const response = await api.get(
            `/api/conversations/messages/${id}?limit=${PAGE_SIZE}`,
          );
          if (!active) return;

          const serverMessages: Message[] = response.data;

          // 3. Merge: replace local with server data (server is authoritive for latest)
          setMessages((prev) => {
            const serverIds = new Set(serverMessages.map((m) => m.id));
            // Keep any local-only messages (optimistic sends not yet confirmed)
            const localOnly = prev.filter(
              (m) => m.id < 0 || !serverIds.has(m.id),
            );
            return [...localOnly, ...serverMessages];
          });

          // 4. Save server messages to local cache
          serverMessages.forEach((msg: Message) => {
            saveMessage({
              messageId: Number(msg.id),
              message: msg.text,
              sentAt: String(msg.sentAt),
              ConversationId: Number(msg.conversationId),
              SenderId: Number(msg.senderId),
            }).catch(() => {});
          });

          // 5. If we got fewer than PAGE_SIZE, there's nothing older to load
          if (serverMessages.length < PAGE_SIZE) {
            setHasMore(false);
          }

          fetchedServerRef.current = true;
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

  // Load older messages (infinite scroll — called when user scrolls to top)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !id) return;

    setLoadingMore(true);
    try {
      // Get the oldest message's sentAt as cursor
      const oldest = messages[0];
      if (!oldest) {
        setHasMore(false);
        return;
      }

      // Try server first
      const response = await api.get(
        `/api/conversations/messages/${id}?limit=${PAGE_SIZE}&before=${oldest.id}`,
      );
      const olderMessages: Message[] = response.data;

      if (olderMessages.length === 0) {
        setHasMore(false);
        return;
      }

      // Merge: prepend older messages, dedup by id
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = olderMessages.filter(
          (m) => !existingIds.has(m.id),
        );
        return [...newMessages, ...prev];
      });

      // Save to local cache
      olderMessages.forEach((msg: Message) => {
        saveMessage({
          messageId: Number(msg.id),
          message: msg.text,
          sentAt: String(msg.sentAt),
          ConversationId: Number(msg.conversationId),
          SenderId: Number(msg.senderId),
        }).catch(() => {});
      });

      if (olderMessages.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch {
      // Server unavailable — try local cache as fallback
      try {
        const oldest = messages[0];
        if (!oldest) return;

        const localOlder = await readMsgsPaginated({
          conversationId: Number(id),
          before: oldest.sentAt,
          limit: PAGE_SIZE,
        });

        if (localOlder.length === 0) {
          setHasMore(false);
          return;
        }

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMessages = (localOlder as Message[]).filter(
            (m) => !existingIds.has(m.id),
          );
          return [...newMessages, ...prev];
        });

        if (localOlder.length < PAGE_SIZE) {
          setHasMore(false);
        }
      } catch {
        // local cache also failed
      }
    } finally {
      setLoadingMore(false);
    }
  }, [id, messages, loadingMore, hasMore]);

  const editMessage = async (messageId: string | number, text: string) => {
    await api.patch(`/api/conversations/messages/${messageId}`, {
      text: text,
    });
    await updateMsg({
      messageId: Number(messageId),
      editedAt: String(new Date().toISOString()),
      message: text,
    });
  };

  const deleteMessage = async (messageId: string | number) => {
    await api.delete(`/api/conversations/messages/${messageId}`);
    await deleteMsg({ messageId: Number(messageId) });
  };
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const tempId = tempIdRef.current--;
    pendingRef.current.set(tempId, trimmed);
    const optimisticMessage: Message = {
      id: tempId,
      text: trimmed,
      sentAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      senderId: currentUserId ?? -1,
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
      pendingRef.current.delete(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    }
  };

  {
    return {
      messages,
      loading,
      loadingMore,
      hasMore,
      sendMessage,
      editMessage,
      deleteMessage,
      loadMore,
    };
  }
}

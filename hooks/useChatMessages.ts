import { api } from "@/lib/api";
import { decryptMessage, encryptMessage } from "@/lib/crypto";
import {
  deleteMsg,
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
  editedAt: string | null;
  senderId: number;
  conversationId: number;
  nonce: string;
};

const PAGE_SIZE = 50;

export default function useChatMessages(
  id: string | number,
  currentUserId: number | null,
  decryptedConversationKey: Uint8Array | undefined,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const tempIdRef = useRef(-1);
  const fetchedServerRef = useRef(false);

  const decryptChatMessages = async ({
    serverMessages,
    decryptedConversationKey,
  }: {
    serverMessages: Message[];
    decryptedConversationKey: Uint8Array;
  }) => {
    return await Promise.all(
      serverMessages.map(async (message) => {
        const { decryptMessage: decryptedText } = await decryptMessage({
          encryptedMessage: message.text,
          nonce: message.nonce,
          decryptedConversationKey: decryptedConversationKey,
        });

        return { ...message, text: decryptedText };
      }),
    );
  };

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
      const unsubscribeNewMessage = listenForNewMessages(async (newMessage) => {
        if (
          Number(newMessage.conversationId) !== Number(id) ||
          !decryptedConversationKey
        ) {
          return;
        }

        const decryptNewMessage = await decryptChatMessages({
          serverMessages: [newMessage],
          decryptedConversationKey,
        });

        updateConversationPreview({
          id: Number(id),
          lastMessageText: decryptNewMessage[0].text,
          lastMessageSentAt: newMessage.sentAt,
        }).catch(() => {});

        saveMessage({
          messageId: newMessage.id,
          message: newMessage.text,
          sentAt: newMessage.sentAt,
          SenderId: newMessage.senderId,
          ConversationId: newMessage.conversationId,
          nonce: newMessage.nonce,
        }).catch(() => {});

        setMessages((currentMsg) => {
          const existingMessage = currentMsg.find(
            (message) => message.id === newMessage.id,
          );

          if (existingMessage) {
            return currentMsg;
          }

          return [...currentMsg, decryptNewMessage[0]];
        });
      });
      const unsubscribeMessageUpdate = listenForMessageUpdates(
        async (updatedMessage) => {
          if (
            Number(updatedMessage.conversationId) !== Number(id) ||
            !decryptedConversationKey
          ) {
            return;
          }

          const decryptUpdatedMessage = await decryptChatMessages({
            serverMessages: [updatedMessage],
            decryptedConversationKey,
          });

          const message = decryptUpdatedMessage[0];

          updateMsg({
            messageId: Number(updatedMessage.id),
            message: updatedMessage.text,
            editedAt: updatedMessage.editedAt,
            nonce: updatedMessage.nonce,
          }).catch(() => {});

          setMessages((currentMsg) =>
            currentMsg.map((current) =>
              current.id === message.id ? message : current,
            ),
          );
        },
      );

      const unsubscribeMessageDelete = listenForMessageDeletes(
        ({ id: deletedId }) => {
          deleteMsg({ messageId: Number(deletedId) }).catch(() => {});
          setMessages((currentMsg) =>
            currentMsg.filter((message) => message.id !== Number(deletedId)),
          );
        },
      );

      const getMessages = async () => {
        setLoading(true);
        try {
          // 1. Load from local cache first (instant display)
          let cache: Message[] = [];
          let decryptedCache: Message[] = [];
          try {
            cache = (await readMsgsPaginated({
              conversationId: Number(id),
              limit: 200,
            })) as Message[];

            if (!decryptedConversationKey) return;
            decryptedCache = await decryptChatMessages({
              serverMessages: cache,
              decryptedConversationKey,
            });
          } catch {
            // cache unavailable
          }
          if (active && decryptedCache.length > 0) {
            setMessages(decryptedCache);
            setLoading(false);
          }

          // 2. Fetch latest messages from server
          const response = await api.get(
            `/api/conversations/messages/${id}?limit=${PAGE_SIZE}`,
          );
          if (!active || !decryptedConversationKey) return;
          const serverMessages: Message[] = response.data;
          if (!decryptedConversationKey) return;
          const decryptedServerMessages = await decryptChatMessages({
            serverMessages,
            decryptedConversationKey,
          });
          // 3. Merge: replace local with server data (server is authoritive for latest)
          setMessages((prev) => {
            const serverIds = new Set(decryptedServerMessages.map((m) => m.id));
            // Keep any local-only messages (optimistic sends not yet confirmed)
            const localOnly = prev.filter(
              (m) => m.id < 0 || !serverIds.has(m.id),
            );
            return [...localOnly, ...decryptedServerMessages];
          });

          // 4. Save server messages to local cache
          serverMessages.forEach((msg: Message) => {
            saveMessage({
              messageId: Number(msg.id),
              message: msg.text,
              sentAt: String(msg.sentAt),
              ConversationId: Number(msg.conversationId),
              SenderId: Number(msg.senderId),
              nonce: msg.nonce,
            }).catch(() => {});
          });

          // 5. If we got fewer than PAGE_SIZE, there's nothing older to load
          if (decryptedServerMessages.length < PAGE_SIZE) {
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
  }, [id, decryptedConversationKey]);

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
      if (!decryptedConversationKey) return;
      const decryptedOlderMessages = await decryptChatMessages({
        serverMessages: olderMessages,
        decryptedConversationKey,
      });
      if (decryptedOlderMessages.length === 0) {
        setHasMore(false);
        return;
      }

      // Merge: prepend older messages, dedup by id
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = decryptedOlderMessages.filter(
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
          nonce: msg.nonce,
        }).catch(() => {});
      });

      if (decryptedOlderMessages.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch {
      // Server unavailable — try local cache as fallback
      try {
        const oldest = messages[0];
        if (!oldest) return;

        const localOlder = (await readMsgsPaginated({
          conversationId: Number(id),
          before: oldest.sentAt,
          limit: PAGE_SIZE,
        })) as Message[];

        if (localOlder.length === 0) {
          setHasMore(false);
          return;
        }

        if (!decryptedConversationKey) return;

        const decryptedLocalOlder = await decryptChatMessages({
          serverMessages: localOlder,
          decryptedConversationKey,
        });

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));

          const newMessages = decryptedLocalOlder.filter(
            (m) => !existingIds.has(m.id),
          );

          return [...newMessages, ...prev];
        });

        if (decryptedLocalOlder.length < PAGE_SIZE) {
          setHasMore(false);
        }
      } catch {
        // local cache also failed
      }
    } finally {
      setLoadingMore(false);
    }
  }, [id, messages, loadingMore, hasMore, decryptedConversationKey]);

  const editMessage = async (messageId: string | number, text: string) => {
    if (!decryptedConversationKey) return;
    const { encryptedMessage: encryptEditedMessage, nonce: editedNonce } =
      await encryptMessage({
        message: text,
        decryptedConversationKey,
      });
    await api.patch(`/api/conversations/messages/${messageId}`, {
      text: encryptEditedMessage,
      nonce: editedNonce,
    });
    await updateMsg({
      messageId: Number(messageId),
      editedAt: String(new Date().toISOString()),
      message: encryptEditedMessage,
      nonce: editedNonce,
    });
  };

  const deleteMessage = async (messageId: string | number) => {
    await api.delete(`/api/conversations/messages/${messageId}`);
    await deleteMsg({ messageId: Number(messageId) });
  };
  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !decryptedConversationKey) return;

    const { encryptedMessage, nonce: encryptedNonce } = await encryptMessage({
      message: trimmed,
      decryptedConversationKey: decryptedConversationKey,
    });
    const tempId = tempIdRef.current--;
    const optimisticMessage: Message = {
      id: tempId,
      text: trimmed,
      sentAt: new Date().toISOString(),
      editedAt: new Date().toISOString(),
      senderId: currentUserId ?? -1,
      conversationId: Number(id),
      nonce: encryptedNonce,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const response = await api.post(`/api/conversations/messages`, {
        messageText: encryptedMessage,
        conversationId: Number(id),
        nonce: encryptedNonce,
      });

      const decryptedResponse = await decryptChatMessages({
        serverMessages: [response.data],
        decryptedConversationKey,
      });

      const confirmedMessage = decryptedResponse[0];

      saveMessage({
        messageId: Number(response.data.id),
        message: response.data.text,
        sentAt: response.data.sentAt,
        SenderId: response.data.senderId,
        ConversationId: response.data.conversationId,
        nonce: encryptedNonce,
      }).catch(() => {});

      updateConversationPreview({
        id: Number(id),
        lastMessageText: confirmedMessage.text,
        lastMessageSentAt: response.data.sentAt,
      }).catch(() => {});

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== tempId);

        const alreadyPresent = withoutOptimistic.some(
          (m) => m.id === confirmedMessage.id,
        );

        return alreadyPresent
          ? withoutOptimistic
          : [...withoutOptimistic, confirmedMessage];
      });
    } catch (err) {
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

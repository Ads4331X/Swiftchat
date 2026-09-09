import { api } from "@/lib/api";
import { decryptMessage, encryptMessage } from "@/lib/crypto";
import {
  deleteMsg,
  deletePendingMessage,
  getPendingMessages,
  markRead,
  readMsgsPaginated,
  saveMessage,
  savePendingMessage,
  updateConversationPreview,
  updateMessageReactions,
  updateMsg,
} from "@/lib/db";
import {
  connectSocket,
  joinConversation,
  listenForMarkRead,
  listenForMessageDeletes,
  listenForMessageUpdates,
  listenForNewMessages,
  listenForReaction,
  listenForReactionUpdate,
} from "@/lib/socket";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNetInfo } from "@react-native-community/netinfo";
import {
  acquireFlushLock,
  flushPendingMessages,
  onPendingFlushed,
  releaseFlushLock,
} from "@/lib/pendingSync";

export type MessageReaction = {
  emoji: string;
  user: { id: number };
};

export type Message = {
  id: number;
  text: string;
  sentAt: string;
  editedAt: string | null;
  senderId: number;
  conversationId: number;
  nonce: string;

  /** Stable client key so optimistic rows keep their position when confirmed. */
  key?: string;

  /** Whether the recipient has read this message (own messages only). */
  read?: boolean;

  /** Group read receipt state. */
  hasAnyoneRead?: boolean;
  hasEveryoneRead?: boolean;

  /** Emoji reactions attached to this message (from the server). */
  reactions?: MessageReaction[];
};

const PAGE_SIZE = 50;

function keyFor(message: Message): string {
  return message.key ?? `m-${message.id}`;
}

// SQLite returns the `reactions` column as a JSON string. Parse it back into
// the `MessageReaction[]` shape used in-memory, treating invalid/empty values
// as "no reactions".
function parseLocalMessage(
  row: Message & { reactions?: string | null },
): Message {
  const { reactions, ...rest } = row;
  if (!reactions) return { ...rest, reactions: [] };
  try {
    const parsed = JSON.parse(reactions);
    return {
      ...rest,
      reactions: Array.isArray(parsed) ? (parsed as MessageReaction[]) : [],
    };
  } catch {
    return { ...rest, reactions: [] };
  }
}

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
  // Tracks the currently shown list so re-effects (e.g. the conversation key
  // reference changing) don't flip the full-screen spinner on over content
  // that is already on screen.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Keep the latest currentUserId available to socket listeners whose effect
  // doesn't re-run when the user id arrives asynchronously.
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const decryptChatMessages = async ({
    serverMessages,
    decryptedConversationKey,
  }: {
    serverMessages: Message[];
    decryptedConversationKey: Uint8Array | null | undefined;
  }) => {
    // No conversation key on this device (private key not restored yet). We
    // still surface the messages so the user sees them, but as placeholders —
    // and we must NEVER generate a key here (that would break decryption for
    // other members).
    if (!decryptedConversationKey) {
      return serverMessages.map((message) => ({
        ...message,
        text: "[Encrypted Message]",
      }));
    }

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

  const { isConnected, isInternetReachable } = useNetInfo();

  // Reconcile the in-memory list with what actually exists on the server/Db
  // now. Optimistic entries (negative id) that are still pending stay visible
  // as "Sending…"; a confirmed message is matched to its optimistic row by
  // nonce and swapped IN PLACE so the FlatList row never unmounts/remounts.
  // Unchanged messages keep their previous object reference so memoized
  // bubbles skip re-rendering (no full-list flash on flush).
  const reconcileMessages = useCallback(async () => {
    const cache = await readMsgsPaginated({
      conversationId: Number(id),
      limit: 200,
    });
    const pending = await getPendingMessages();
    const pendingIds = new Set(pending.map((p) => p.id));

    const confirmed = await decryptChatMessages({
      serverMessages: (
        cache as (Message & { reactions?: string | null })[]
      ).map(parseLocalMessage),
      decryptedConversationKey,
    });

    setMessages((prev) => {
      const confirmedById = new Map(confirmed.map((m) => [m.id, m]));
      const confirmedByNonce = new Map<string, Message>();
      for (const m of confirmed) {
        if (m.nonce && !confirmedByNonce.has(m.nonce)) {
          confirmedByNonce.set(m.nonce, m);
        }
      }

      const next: Message[] = [];
      const representedIds = new Set<number>();

      for (const m of prev) {
        if (m.id < 0 && !pendingIds.has(m.id)) {
          // This optimistic message was just confirmed. Swap it in place,
          // keeping the stable key so the row doesn't unmount.
          const replacement =
            confirmedByNonce.get(m.nonce) ?? confirmedById.get(m.id);
          if (replacement) {
            next.push({ ...replacement, key: m.key ?? keyFor(replacement) });
            representedIds.add(replacement.id);
          } else {
            // Not in pending table AND no confirmed match — don't silently
            // drop it, keep it visible until we know what actually happened.
            next.push(m);
          }
          continue;
        }
        next.push(m);
        if (m.id >= 0) representedIds.add(m.id);
      }

      // Append confirmed rows not already represented (e.g. messages that
      // arrived via the background flusher while this screen was closed).
      for (const m of confirmed) {
        if (!representedIds.has(m.id)) {
          next.push({ ...m, key: keyFor(m) });
          representedIds.add(m.id);
        }
      }

      return next;
    });
  }, [id, decryptedConversationKey]);

  // Flush offline (pending) messages through the global shared flusher so we
  // never double-post with the background sync. Reconcile our list whenever a
  // flush lands on this conversation.
  useEffect(() => {
    const unsubscribe = onPendingFlushed(({ conversationIds }) => {
      if (conversationIds.includes(Number(id))) {
        reconcileMessages().catch(() => {});
      }
    });

    const online =
      isConnected === true ||
      isInternetReachable !== false ||
      isInternetReachable == null;
    if (online) {
      flushPendingMessages()
        .then(reconcileMessages)
        .catch(() => {});
    }

    return unsubscribe;
  }, [isConnected, isInternetReachable, id, reconcileMessages]);
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
        if (Number(newMessage.conversationId) !== Number(id)) {
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
          reactions: newMessage.reactions
            ? JSON.stringify(newMessage.reactions)
            : undefined,
        }).catch(() => {});

        setMessages((currentMsg) => {
          if (currentMsg.some((message) => message.id === newMessage.id)) {
            return currentMsg;
          }

          // The server broadcasts our own messages back to us. If this echo
          // matches one of our optimistic (Sending…) rows by nonce, swap it
          // in place — keeping the stable key — instead of appending a
          // duplicate next to the original.
          const echoIndex = currentMsg.findIndex(
            (message) =>
              message.id < 0 &&
              message.senderId === currentUserIdRef.current &&
              message.nonce === newMessage.nonce,
          );
          if (echoIndex >= 0) {
            const optimistic = currentMsg[echoIndex];
            const next = [...currentMsg];
            next[echoIndex] = {
              ...decryptNewMessage[0],
              key: optimistic.key ?? `m-${decryptNewMessage[0].id}`,
            };
            return next;
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

      const unsubscribeMarkRead = listenForMarkRead(
        ({ conversationId, messageId, userId, readAt }) => {
          if (Number(conversationId) !== Number(id)) return;
          if (Number(userId) === currentUserIdRef.current) return;
          
          markRead({
            conversationId: Number(conversationId),
            messageId,
            userId,
            readAt,
          }).catch(() => {});
          setMessages((currentMsg) =>
            currentMsg.map((m) =>
              m.id === messageId && m.senderId === currentUserIdRef.current
                ? { ...m, read: true }
                : m,
            ),
          );
        },
      );

      const applyReaction = (
        messageId: number,
        userId: number,
        emoji: string,
        removed: boolean,
      ) => {
        let found = false;
        let nextReactions: MessageReaction[] = [];
        setMessages((currentMsg) =>
          currentMsg.map((m) => {
            if (m.id !== messageId) return m;
            found = true;
            const reactions = m.reactions ?? [];
            const others = reactions.filter((r) => r.user.id !== userId);
            nextReactions = removed
              ? others
              : [...others, { emoji, user: { id: userId } }];
            return { ...m, reactions: nextReactions };
          }),
        );
        if (found) {
          updateMessageReactions({
            messageId,
            reactions: JSON.stringify(nextReactions),
          }).catch(() => {});
        }
      };

      const unsubscribeReaction = listenForReaction(
        ({ conversationId, messageId, userId, emoji, removed }) => {
          if (Number(conversationId) !== Number(id)) return;
          applyReaction(Number(messageId), Number(userId), emoji, !!removed);
        },
      );

      const unsubscribeReactionUpdate = listenForReactionUpdate(
        ({ conversationId, messageId, userId, emoji, removed }) => {
          if (Number(conversationId) !== Number(id)) return;
          applyReaction(Number(messageId), Number(userId), emoji, !!removed);
        },
      );

      const getMessages = async () => {
        if (messagesRef.current.length === 0) {
          setLoading(true);
        }
        try {
          // 1. Load from local cache first (instant display < 10ms)
          try {
            const cache = (await readMsgsPaginated({
              conversationId: Number(id),
              limit: 200,
            })) as (Message & { reactions?: string | null })[];

            if (cache.length > 0) {
              const decryptedCache = await decryptChatMessages({
                serverMessages: cache.map(parseLocalMessage),
                decryptedConversationKey,
              });

              if (active && decryptedCache.length > 0) {
                setMessages(decryptedCache);
                setLoading(false); // <--- Instant WhatsApp-style local rendering!
              }
            }
          } catch {
            // cache unavailable
          }

          // 2. Fetch latest messages from server in background
          const response = await api.get(
            `/api/conversations/messages/${id}?limit=${PAGE_SIZE}`,
          );
          if (!active) return;
          const serverMessages: Message[] = response.data;
          const decryptedServerMessages = await decryptChatMessages({
            serverMessages,
            decryptedConversationKey,
          });

          // 3. Merge: keep existing rows (by reference so memoized bubbles
          // don't re-render) and only add messages we don't already have.
          if (active) {
            setMessages((prev) => {
              const prevById = new Map(prev.map((m) => [m.id, m]));
              const merged: Message[] = [];
              for (const m of decryptedServerMessages) {
                // Always use the freshly-decrypted row, not a previously
                // rendered one: it may be a "[Encrypted Message]" placeholder
                // from before the conversation key was available. Keep the
                // existing row's key so the bubble doesn't remount.
                const existing = prevById.get(m.id);
                merged.push(
                  existing
                    ? { ...m, key: existing.key ?? keyFor(m) }
                    : { ...m, key: keyFor(m) },
                );
              }
              const mergedIds = new Set(merged.map((m) => m.id));
              const localOnly = prev.filter(
                (m) => m.id < 0 || !mergedIds.has(m.id),
              );
              return [...localOnly, ...merged];
            });
            setLoading(false);
          }

          // 4. Save server messages to local cache
          serverMessages.forEach((msg: Message) => {
            saveMessage({
              messageId: Number(msg.id),
              message: msg.text,
              sentAt: String(msg.sentAt),
              ConversationId: Number(msg.conversationId),
              SenderId: Number(msg.senderId),
              nonce: msg.nonce,
              reactions: msg.reactions
                ? JSON.stringify(msg.reactions)
                : undefined,
            }).catch(() => {});
          });

          if (decryptedServerMessages.length < PAGE_SIZE) {
            setHasMore(false);
          }

          fetchedServerRef.current = true;
        } catch (err) {
          console.warn("Error fetching server messages:", err);
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
        unsubscribeMarkRead && unsubscribeMarkRead();
        unsubscribeReaction && unsubscribeReaction();
        unsubscribeReactionUpdate && unsubscribeReactionUpdate();
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
          reactions: msg.reactions ? JSON.stringify(msg.reactions) : undefined,
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
        })) as (Message & { reactions?: string | null })[];

        if (localOlder.length === 0) {
          setHasMore(false);
          return;
        }

        const decryptedLocalOlder = await decryptChatMessages({
          serverMessages: localOlder.map(parseLocalMessage),
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

  const reactToMessage = async (messageId: string | number, emoji: string) => {
    if (!currentUserId) return;
    const numericId = Number(messageId);
    let wasRemoved = false;
    let nextReactions: MessageReaction[] = [];

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== numericId) return m;
        const reactions = m.reactions ?? [];
        const existing = reactions.find((r) => r.user.id === currentUserId);
        wasRemoved = existing?.emoji === emoji;
        const others = reactions.filter((r) => r.user.id !== currentUserId);
        nextReactions = wasRemoved
          ? others
          : [...others, { emoji, user: { id: currentUserId } }];
        return {
          ...m,
          reactions: nextReactions,
        };
      }),
    );

    updateMessageReactions({
      messageId: numericId,
      reactions: JSON.stringify(nextReactions),
    }).catch(() => {});

    try {
      await api.post(`/api/conversations/messages/${messageId}/reactions`, {
        emoji,
      });
    } catch (err) {
      // roll back on failure
      let rollbackReactions: MessageReaction[] = [];
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== numericId) return m;
          const reactions = m.reactions ?? [];
          const others = reactions.filter((r) => r.user.id !== currentUserId);
          rollbackReactions = wasRemoved
            ? [...others, { emoji, user: { id: currentUserId } }]
            : others;
          return {
            ...m,
            reactions: rollbackReactions,
          };
        }),
      );
      updateMessageReactions({
        messageId: numericId,
        reactions: JSON.stringify(rollbackReactions),
      }).catch(() => {});
      console.warn("Failed to react:", err);
    }
  };

  const deleteMessage = async (messageId: string | number) => {
    await api.delete(`/api/conversations/messages/${messageId}`);
    await deleteMsg({ messageId: Number(messageId) });
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !decryptedConversationKey) return;

    const tempId = tempIdRef.current--;
    const optimisticMessage: Message = {
      id: tempId,
      key: `m-local-${tempId}`,
      text: trimmed,
      sentAt: new Date().toISOString(),
      editedAt: null,
      senderId: currentUserId ?? -1,
      conversationId: Number(id),
      nonce: "",
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    const held = await acquireFlushLock();
    try {
      const { encryptedMessage, nonce: encryptedNonce } = await encryptMessage({
        message: trimmed,
        decryptedConversationKey,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, nonce: encryptedNonce } : m,
        ),
      );
      optimisticMessage.nonce = encryptedNonce;

      await savePendingMessage({
        message: encryptedMessage,
        nonce: encryptedNonce,
        messageId: optimisticMessage.id,
        SenderId: optimisticMessage.senderId,
        ConversationId: optimisticMessage.conversationId,
        sentAt: optimisticMessage.sentAt,
      });

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

      try {
        await saveMessage({
          messageId: Number(response.data.id),
          message: response.data.text,
          sentAt: response.data.sentAt,
          SenderId: response.data.senderId,
          ConversationId: response.data.conversationId,
          nonce: encryptedNonce,
          reactions: response.data.reactions
            ? JSON.stringify(response.data.reactions)
            : undefined,
        });
        await deletePendingMessage({ messageId: tempId });
      } catch (err) {
        console.error("Saved to server but failed to save locally:", err);
      }
      updateConversationPreview({
        id: Number(id),
        lastMessageText: confirmedMessage.text,
        lastMessageSentAt: response.data.sentAt,
      }).catch(() => {});

      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id === tempId) {
            return {
              ...confirmedMessage,
              key: m.key ?? `m-${confirmedMessage.id}`,
            };
          }
          return m;
        });
        if (next.some((m) => m.id === confirmedMessage.id)) return next;
        return [
          ...next,
          { ...confirmedMessage, key: keyFor(confirmedMessage) },
        ];
      });
    } catch (err) {
      console.error("sendMessage failed:", err);
    } finally {
      if (held) releaseFlushLock();
    }
  };

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    reactToMessage,
    loadMore,
  };
}

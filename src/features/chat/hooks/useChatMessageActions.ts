import type { Dispatch, RefObject, SetStateAction } from "react";
import Toast from "react-native-toast-message";
import { api } from "@/core/api";
import {
  deleteMsg,
  deletePendingMessage,
  savePendingMessage,
  updateConversationPreview,
  updateMessageReactions,
  updateMsg,
} from "@/core/db";
import { removeMessageFromSearch, updateMessageInSearch } from "@/core/db/search";
import { encryptMessage } from "@/core/crypto";
import { acquireFlushLock, releaseFlushLock } from "@/features/chat/services/sync";
import { decryptMessages, persistMessageLocally } from "@/features/chat/services";
import { Message, MessageReaction } from "@/types/message";

type Props = {
  id: string | number;
  currentUserId: number | null;
  decryptedConversationKey: Uint8Array | undefined;
  messages: Message[];
  tempIdRef: RefObject<number>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

// Optimistic message helpers — every send goes through the same flow:
// temp id -> in-memory row -> encrypt -> pending table -> POST -> confirm.
export default function useChatMessageActions({
  id,
  currentUserId,
  decryptedConversationKey,
  messages,
  tempIdRef,
  setMessages,
}: Props) {
  const replaceOptimisticWithConfirmed = (
    tempId: number,
    optimisticKey: string | undefined,
    confirmed: Message,
  ) => {
    setMessages((prev) => {
      const next = prev.map((m) => {
        if (m.id === tempId) {
          return {
            ...confirmed,
            key: optimisticKey ?? `m-${confirmed.id}`,
          };
        }
        return m;
      });
      if (next.some((m) => m.id === confirmed.id)) return next;
      return [
        ...next,
        { ...confirmed, key: `m-${confirmed.id}` },
      ];
    });
  };

  const sendPending = async ({
    message,
    nonce,
    messageId,
    senderId,
    conversationId,
    sentAt,
    replyToId,
    repliedTo,
  }: {
    message: string;
    nonce: string;
    messageId: number;
    senderId: number;
    conversationId: number;
    sentAt: string;
    replyToId?: number;
    repliedTo?: string;
  }) => {
    await savePendingMessage({
      message,
      nonce,
      messageId,
      SenderId: senderId,
      ConversationId: conversationId,
      sentAt,
      replyToId,
      repliedTo,
    });
  };

  const replyMessage = async (
    messageId: string | number,
    text: string,
    conversationId: number | string,
  ) => {
    if (!decryptedConversationKey) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const original = messages.find((m) => m.id === Number(messageId));
    const tempId = tempIdRef.current--;
    const repliedToSnapshot = original?.text
      ? {
          senderName: original.senderId === currentUserId ? "You" : "Reply",
          text: original.text,
        }
      : undefined;
    const optimisticMessage: Message = {
      id: tempId,
      key: `m-local-${tempId}`,
      text: trimmed,
      sentAt: new Date().toISOString(),
      editedAt: null,
      senderId: currentUserId ?? -1,
      conversationId: Number(id),
      nonce: "",
      replyToId: Number(messageId),
      repliedTo: repliedToSnapshot,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    const held = await acquireFlushLock();
    let queued = false;
    try {
      const { encryptedMessage, nonce: replyNonce } = await encryptMessage({
        message: trimmed,
        decryptedConversationKey,
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, nonce: replyNonce } : m)),
      );
      optimisticMessage.nonce = replyNonce;

      await sendPending({
        message: encryptedMessage,
        nonce: replyNonce,
        messageId: optimisticMessage.id,
        senderId: optimisticMessage.senderId,
        conversationId: optimisticMessage.conversationId,
        sentAt: optimisticMessage.sentAt,
        replyToId: Number(messageId),
        repliedTo: repliedToSnapshot
          ? JSON.stringify(repliedToSnapshot)
          : undefined,
      });
      queued = true;

      const response = await api.post(`/api/conversations/messages`, {
        messageText: encryptedMessage,
        conversationId: Number(conversationId),
        nonce: replyNonce,
        replyToId: Number(messageId),
      });

      const [confirmedMessage] = await decryptMessages({
        serverMessages: [response.data],
        decryptedConversationKey,
      });
      if (!confirmedMessage) return;

      try {
        await persistMessageLocally(response.data, confirmedMessage.text, {
          nonce: replyNonce,
          replyToId: Number(messageId),
          repliedTo: repliedToSnapshot
            ? JSON.stringify(repliedToSnapshot)
            : undefined,
        });
        await deletePendingMessage({ messageId: tempId });
      } catch (err) {
        console.error("Saved reply to server but failed to save locally:", err);
      }
      updateConversationPreview({
        id: Number(id),
        lastMessageText: confirmedMessage.text,
        lastMessageSentAt: response.data.sentAt,
      }).catch(() => {});

      replaceOptimisticWithConfirmed(tempId, optimisticMessage.key, confirmedMessage);
    } catch (err) {
      console.error("replyMessage failed:", err);
      Toast.show({
        type: "error",
        text1: "Message not sent",
        text2: queued
          ? "Backend unreachable — queued and will retry automatically."
          : "Could not send right now. Please try again.",
      });
    } finally {
      if (held) releaseFlushLock();
    }
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
    let queued = false;
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

      await sendPending({
        message: encryptedMessage,
        nonce: encryptedNonce,
        messageId: optimisticMessage.id,
        senderId: optimisticMessage.senderId,
        conversationId: optimisticMessage.conversationId,
        sentAt: optimisticMessage.sentAt,
      });
      queued = true;

      const response = await api.post(`/api/conversations/messages`, {
        messageText: encryptedMessage,
        conversationId: Number(id),
        nonce: encryptedNonce,
      });

      const [confirmedMessage] = await decryptMessages({
        serverMessages: [response.data],
        decryptedConversationKey,
      });
      if (!confirmedMessage) return;

      try {
        await persistMessageLocally(response.data, confirmedMessage.text, {
          nonce: encryptedNonce,
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

      replaceOptimisticWithConfirmed(tempId, optimisticMessage.key, confirmedMessage);
    } catch (err) {
      console.error("sendMessage failed:", err);
      Toast.show({
        type: "error",
        text1: "Message not sent",
        text2: queued
          ? "Backend unreachable — queued and will retry automatically."
          : "Could not send right now. Please try again.",
      });
    } finally {
      if (held) releaseFlushLock();
    }
  };

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

    await updateMessageInSearch({
      messageId: Number(messageId),
      content: text,
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
    const numericId = Number(messageId);

    if (Number.isNaN(numericId)) return;

    // local-only message that hasn't reached the server yet (pending) —
    // remove locally, never call the API with a temp negative id
    if (numericId < 0) {
      await deletePendingMessage({ messageId: numericId }).catch(() => {});
      await deleteMsg({ messageId: numericId }).catch(() => {});
      await removeMessageFromSearch({ messageId: numericId }).catch(() => {});
      setMessages((prev) => prev.filter((m) => m.id !== numericId));
      return;
    }

    const removeLocalMessage = () => {
      setMessages((prev) => {
        const remaining = prev.filter((m) => m.id !== numericId);
        if (remaining.length === prev.length) return prev;
        if (prev[prev.length - 1]?.id === numericId) {
          const last = remaining[remaining.length - 1];
          updateConversationPreview({
            id: Number(id),
            lastMessageText: last?.text ?? "",
            lastMessageSentAt: last?.sentAt ?? "",
          }).catch(() => {});
        }
        return remaining;
      });
    };

    try {
      await api.delete(`/api/conversations/messages/${messageId}`);
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (status !== 403 && status !== 404) {
        console.warn("Failed to delete message:", err);
        Toast.show({
          type: "error",
          text1: "Couldn't delete message",
          text2: "You can only delete your own sent messages.",
        });
        return;
      }
    } finally {
      await deleteMsg({ messageId: numericId }).catch(() => {});
      await removeMessageFromSearch({ messageId: numericId }).catch(() => {});
      removeLocalMessage();
    }
  };

  return {
    sendMessage,
    editMessage,
    replyMessage,
    deleteMessage,
    reactToMessage,
  };
}
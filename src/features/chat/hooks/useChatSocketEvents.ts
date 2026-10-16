import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  connectSocket,
  joinConversation,
  listenForMarkRead,
  listenForMessageDeletes,
  listenForMessageUpdates,
  listenForNewMessages,
  listenForReaction,
  listenForReactionUpdate,
} from "@/core/socket";
import {
  deleteMsg,
  markRead,
  updateConversationPreview,
  updateMessageReactions,
  updateMsg,
} from "@/core/db";
import {
  removeMessageFromSearch,
  updateMessageInSearch,
} from "@/core/db/search";
import { decryptMessages, persistMessageLocally } from "@/features/chat/services";
import { Message, MessageReaction } from "@/types/message";

type Props = {
  id: string | number;
  decryptedConversationKey: Uint8Array | undefined;
  currentUserIdRef: { current: number | null };
  setMessages: Dispatch<SetStateAction<Message[]>>;
};

/**
 * Subscribes to all socket events for one conversation: new messages, edits,
 * deletions, read receipts and reactions. Each incoming payload is decrypted,
 * persisted to the local cache and merged into the in-memory list.
 */
export default function useChatSocketEvents({
  id,
  decryptedConversationKey,
  currentUserIdRef,
  setMessages,
}: Props) {
  useEffect(() => {
    if (!id) return;
    // No key yet — don't subscribe; the wider sync effect resets the list and
    // listeners get wired up once the conversation key is available.
    if (!decryptedConversationKey) return;
    let active = true;

    const init = async () => {
      await connectSocket();

      if (!active) return;

      joinConversation({ id: String(id) });

      const unsubscribeNewMessage = listenForNewMessages(
        async (newMessage: Message) => {
          if (Number(newMessage.conversationId) !== Number(id)) {
            return;
          }

          const [decrypted] = await decryptMessages({
            serverMessages: [newMessage],
            decryptedConversationKey,
          });
          if (!decrypted) return;

          updateConversationPreview({
            id: Number(id),
            lastMessageText: decrypted.text,
            lastMessageSentAt: newMessage.sentAt,
          }).catch(() => {});

          // Save the raw message locally and index the decrypted text for
          // search.
          persistMessageLocally(newMessage, decrypted.text).catch(() => {});

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
                ...decrypted,
                key: optimistic.key ?? `m-${decrypted.id}`,
              };
              return next;
            }

            return [...currentMsg, decrypted];
          });
        },
      );

      const unsubscribeMessageUpdate = listenForMessageUpdates(
        async (updatedMessage) => {
          if (
            Number(updatedMessage.conversationId) !== Number(id) ||
            !decryptedConversationKey
          ) {
            return;
          }

          const [decrypted] = await decryptMessages({
            serverMessages: [updatedMessage],
            decryptedConversationKey,
          });
          if (!decrypted) return;

          updateMsg({
            messageId: Number(updatedMessage.id),
            message: updatedMessage.text,
            editedAt: updatedMessage.editedAt,
            nonce: updatedMessage.nonce,
          }).catch(() => {});

          updateMessageInSearch({
            messageId: Number(decrypted.id),
            content: decrypted.text,
          });

          setMessages((currentMsg) =>
            currentMsg.map((current) =>
              current.id === decrypted.id ? decrypted : current,
            ),
          );
        },
      );

      const unsubscribeMessageDelete = listenForMessageDeletes(
        ({ id: deletedId }) => {
          deleteMsg({ messageId: Number(deletedId) }).catch(() => {});
          removeMessageFromSearch({ messageId: Number(deletedId) }).catch(
            () => {},
          );
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
  }, [id, decryptedConversationKey, currentUserIdRef, setMessages]);
}
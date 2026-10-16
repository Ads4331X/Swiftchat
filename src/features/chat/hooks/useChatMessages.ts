import { useEffect, useRef, useState } from "react";
import {
  hasSeenConversation,
  isConversationSeen,
  markConversationSeen,
} from "@/features/chat/services/sync";
import useChatMessageActions from "@/features/chat/hooks/useChatMessageActions";
import useChatMessagePagination from "@/features/chat/hooks/useChatMessagePagination";
import useChatMessageSync from "@/features/chat/hooks/useChatMessageSync";
import useChatSocketEvents from "@/features/chat/hooks/useChatSocketEvents";
import { Message } from "@/types/message";
import { getPendingMessages } from "@/core/db";

export type { Message, MessageReaction, RepliedTo } from "@/types/message";

/**
 * Owns the chat message state and composes the smaller concerns that keep it
 * in sync: data loading/sync, socket events, message actions and pagination.
 */
export default function useChatMessages(
  id: string | number,
  currentUserId: number | null,
  decryptedConversationKey: Uint8Array | undefined,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [serverLoaded, setServerLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [firstLoad, setFirstLoad] = useState(
    () => !hasSeenConversation(Number(id)),
  );

  // Skeleton only on the very first time this conversation is ever opened on
  // this device. On native the persisted "seen" flag loads asynchronously, so
  // resolve it here too after the store is read.
  useEffect(() => {
    let active = true;
    isConversationSeen(Number(id)).then((seen) => {
      if (!active) return;
      setFirstLoad(!seen);
    });
    return () => {
      active = false;
    };
  }, [id]);
  const showSkeleton = firstLoad && !initialized;
  const tempIdRef = useRef(-1);

  // Optimistic sends claim descending negative ids, and that number becomes the
  // queued row's `PendingMessage.id`. The counter used to restart at -1 on every
  // mount, so a new session re-issued ids that still belonged to unsent rows
  // from the previous one and `INSERT OR REPLACE` overwrote them. Resume below
  // the lowest id actually persisted.
  useEffect(() => {
    let active = true;
    getPendingMessages()
      .then((rows) => {
        if (!active || rows.length === 0) return;
        const lowest = rows.reduce(
          (min, row) => Math.min(min, Number(row.id)),
          -1,
        );
        if (lowest < tempIdRef.current) {
          tempIdRef.current = lowest - 1;
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Once this conversation has actually loaded, remember it so later opens
  // (even after an app restart/reload) skip the skeleton.
  useEffect(() => {
    if (initialized) {
      markConversationSeen(Number(id));
    }
  }, [initialized, id]);

  // Keep the latest currentUserId available to socket listeners whose effect
  // doesn't re-run when the user id arrives asynchronously.
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  useChatMessageSync({
    id,
    decryptedConversationKey,
    setMessages,
    setInitialized,
    setHasMore,
    setServerLoaded,
  });

  useChatSocketEvents({
    id,
    decryptedConversationKey,
    currentUserIdRef,
    setMessages,
  });

  const {
    sendMessage,
    editMessage,
    replyMessage,
    deleteMessage,
    reactToMessage,
  } = useChatMessageActions({
    id,
    currentUserId,
    decryptedConversationKey,
    messages,
    tempIdRef,
    setMessages,
  });

  const { loadMore, loadingMore } = useChatMessagePagination({
    id,
    decryptedConversationKey,
    messages,
    hasMore,
    setMessages,
    setHasMore,
  });

  return {
    messages,
    showSkeleton,
    initialized,
    serverLoaded,
    loadingMore,
    hasMore,
    sendMessage,
    editMessage,
    replyMessage,
    deleteMessage,
    reactToMessage,
    loadMore,
  };
}
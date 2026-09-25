import { useEffect, useRef, useState } from "react";
import {
  hasSeenConversation,
  isConversationSeen,
  markConversationSeen,
} from "@/lib/sync";
import useChatMessageActions from "@/hooks/useChatMessageActions";
import useChatMessagePagination from "@/hooks/useChatMessagePagination";
import useChatMessageSync from "@/hooks/useChatMessageSync";
import useChatSocketEvents from "@/hooks/useChatSocketEvents";
import { Message } from "@/types/message";

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
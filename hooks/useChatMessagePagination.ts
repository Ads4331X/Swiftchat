import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "@/lib/api";
import { readMsgsPaginated } from "@/lib/db";
import {
  decryptMessages,
  LocalMessageRow,
  PAGE_SIZE,
  parseLocalMessage,
  persistServerMessages,
} from "@/lib/chat";
import { prefetchAttachments } from "@/lib/chat/attachmentLoader";
import { Message } from "@/types/message";

// how many attachments from a loaded page to warm.
const PREFETCH_LIMIT = 16;

type Props = {
  id: string | number;
  decryptedConversationKey: Uint8Array | undefined;
  messages: Message[];
  hasMore: boolean;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
};

/**
 * Infinite scroll for older messages. Tries the server first, then falls back
 * to the local cache when offline.
 */
export default function useChatMessagePagination({
  id,
  decryptedConversationKey,
  messages,
  hasMore,
  setMessages,
  setHasMore,
}: Props) {
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !id) return;

    setLoadingMore(true);
    try {
      // Get the oldest message's id as the server cursor.
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
      const decryptedOlderMessages = await decryptMessages({
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
      await persistServerMessages(olderMessages, decryptedOlderMessages);

      prefetchAttachments(
        decryptedOlderMessages.slice(-PREFETCH_LIMIT),
      ).catch(() => {});

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
        })) as LocalMessageRow[];

        if (localOlder.length === 0) {
          setHasMore(false);
          return;
        }

        const decryptedLocalOlder = await decryptMessages({
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

        prefetchAttachments(
          decryptedLocalOlder.slice(-PREFETCH_LIMIT),
        ).catch(() => {});

        if (decryptedLocalOlder.length < PAGE_SIZE) {
          setHasMore(false);
        }
      } catch {
        // local cache also failed
      }
    } finally {
      setLoadingMore(false);
    }
  }, [
    id,
    messages,
    loadingMore,
    hasMore,
    decryptedConversationKey,
    setMessages,
    setHasMore,
  ]);

  return { loadMore, loadingMore };
}
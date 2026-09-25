import { useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useNetInfo } from "@react-native-community/netinfo";
import { api } from "@/lib/api";
import { getPendingMessages, readMsgsPaginated } from "@/lib/db";
import {
  flushPendingMessages,
  onChatCleared,
  onPendingFlushed,
} from "@/lib/sync";
import {
  decryptMessages,
  keyFor,
  LocalMessageRow,
  PAGE_SIZE,
  parseLocalMessage,
  persistServerMessages,
} from "@/lib/chat";
import { Message } from "@/types/message";

type Props = {
  id: string | number;
  decryptedConversationKey: Uint8Array | undefined;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setInitialized: Dispatch<SetStateAction<boolean>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setServerLoaded: Dispatch<SetStateAction<boolean>>;
};

/**
 * Handles the data side of the chat screen: the initial cache + server load,
 * reconciliation with the pending-message flusher, and reacting to the
 * conversation being cleared from elsewhere in the app.
 */
export default function useChatMessageSync({
  id,
  decryptedConversationKey,
  setMessages,
  setInitialized,
  setHasMore,
  setServerLoaded,
}: Props) {
  const { isConnected, isInternetReachable } = useNetInfo();

  // Reconcile the in-memory list with what actually exists on the server/Db
  // now. Optimistic entries (negative id) that are still pending stay visible
  // as "Sending…"; a confirmed message is matched to its optimistic row by
  // nonce and swapped IN PLACE so the FlatList row never unmounts/remounts.
  // Unchanged messages keep their previous object reference so memoized
  // bubbles skip re-rendering (no full-list flash on flush).
  const reconcileMessages = useCallback(async () => {
    // No key yet (still loading on mount) — don't render the cache as
    // "[Encrypted Message]" placeholders; the real load decrypts properly.
    if (!decryptedConversationKey) return;

    const cache = (await readMsgsPaginated({
      conversationId: Number(id),
      limit: 200,
    })) as LocalMessageRow[];
    const pending = await getPendingMessages();
    const pendingIds = new Set(pending.map((p) => p.id));

    const confirmed = await decryptMessages({
      serverMessages: cache.map(parseLocalMessage),
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
  }, [id, decryptedConversationKey, setMessages]);

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

  // React when this conversation is cleared from anywhere in the app (swipe
  // action, profile screen): drop the in-memory list so the screen shows empty.
  useEffect(() => {
    const unsubscribe = onChatCleared(({ conversationId }) => {
      if (Number(conversationId) === Number(id)) {
        setMessages([]);
        setHasMore(true);
      }
    });
    return unsubscribe;
  }, [id, setMessages, setHasMore]);

  // Initial load: local cache first (instant display), then fetch the latest
  // messages from the server in the background and merge them in.
  useEffect(() => {
    if (!id) return;
    let active = true;

    if (!decryptedConversationKey) {
      setMessages([]);
      setHasMore(false);
      return;
    }

    // Reset state when the conversation changes. Keep any already-loaded
    // messages visible while the fresh server page is in flight — only the
    // empty state is gated on the server having answered.
    setHasMore(true);
    setServerLoaded(false);

    const getMessages = async () => {
      try {
        // 1. Load from local cache first (instant display < 10ms)
        try {
          const cache = (await readMsgsPaginated({
            conversationId: Number(id),
            limit: 200,
          })) as LocalMessageRow[];

          if (cache.length > 0) {
            const decryptedCache = await decryptMessages({
              serverMessages: cache.map(parseLocalMessage),
              decryptedConversationKey,
            });

            if (active && decryptedCache.length > 0) {
              setMessages(decryptedCache);
            }
          }
          if (active) {
            setInitialized(true); // local cache read — we know the real state
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
        const decryptedServerMessages = await decryptMessages({
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
        }

        // 4. Save server messages to the local cache
        await persistServerMessages(serverMessages, decryptedServerMessages);

        if (decryptedServerMessages.length < PAGE_SIZE) {
          setHasMore(false);
        }
      } catch (err) {
        console.warn("Error fetching server messages:", err);
      } finally {
        if (active) {
          setInitialized(true);
          setServerLoaded(true);
        }
      }
    };

    getMessages();

    return () => {
      active = false;
    };
  }, [
    id,
    decryptedConversationKey,
    setMessages,
    setInitialized,
    setHasMore,
    setServerLoaded,
  ]);
}
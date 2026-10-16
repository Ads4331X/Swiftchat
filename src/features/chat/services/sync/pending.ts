import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { api } from "@/core/api";
import { getToken } from "@/features/auth/services";
import {
  confirmPendingMessage,
  deletePendingMessage,
  getMessageByNonce,
  getPendingMessages,
  updateConversationPreview,
} from "@/core/db";

let started = false;
let flushing = false;
let flushLockHeld = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

type FlushListener = (info: { conversationIds: number[] }) => void;
const listeners = new Set<FlushListener>();

/**
 * Subscribe to successful pending-message flushes. Chat screens use this to
 * reconcile their in-memory list (swap optimistic "Sending…" entries for the
 * confirmed server-message rows) without doing their own HTTP posts.
 */
export function onPendingFlushed(listener: FlushListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyFlushed(conversationId: number) {
  listeners.forEach((listener) =>
    listener({ conversationIds: [conversationId] }),
  );
}

/**
 * Acquire the shared flush lock. The chat screen holds this for the entire
 * duration of a direct POST (from BEFORE the pending row is saved) so the
 * background flusher can never observe that row and double-send it. Awaits a
 * concurrently running flush to finish first; returns false only after a
 * generous timeout (meaning the send will proceed unguarded as a last resort).
 */
export async function acquireFlushLock(timeoutMs = 10000): Promise<boolean> {
  const start = Date.now();
  while (flushLockHeld || flushing) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  flushLockHeld = true;
  return true;
}

export function releaseFlushLock(): void {
  flushLockHeld = false;
}

/**
 * Global flush of offline (pending) messages. Runs regardless of which
 * screen is open, so messages sent while offline are delivered as soon as
 * connectivity returns — even outside the chat screen.
 */
export async function flushPendingMessages(): Promise<void> {
  if (flushing || flushLockHeld) return;

  const token = await getToken("token");
  if (!token) {
    scheduleRetry();
    return;
  }

  flushing = true;
  try {
    const pending = await getPendingMessages();
    const remaining = [...pending];

    for (const pendingMessage of pending) {
      try {
        // An earlier attempt may have reached the server before the app died,
        // leaving the row queued but already cached. Posting again would
        // create a second copy server-side, so reconcile from the cache first.
        const alreadyDelivered = await getMessageByNonce({
          nonce: pendingMessage.nonce,
        });

        if (alreadyDelivered) {
          await deletePendingMessage({ messageId: pendingMessage.id });
          remaining.shift();
          continue;
        }

        const result = await api.post("/api/conversations/messages", {
          messageText: pendingMessage.text,
          conversationId: pendingMessage.conversationId,
          nonce: pendingMessage.nonce,
          replyToId: pendingMessage.replyToId ?? null,
          forwardedFromMsgId: pendingMessage.forwardedFromMsgId ?? null,
        });

        if (result.data?.id == null) {
          throw new Error("No message id returned");
        }

        // Keep the locally generated nonce rather than the server's echo: the
        // optimistic row in the chat list is matched to its confirmed
        // counterpart by nonce, and it only knows the local one.
        await confirmPendingMessage({
          pendingId: pendingMessage.id,
          messageId: result.data.id,
          message: result.data.text,
          sentAt: result.data.sentAt,
          SenderId: result.data.senderId,
          ConversationId: result.data.conversationId,
          nonce: pendingMessage.nonce,
          replyToId: pendingMessage.replyToId ?? undefined,
          repliedTo: pendingMessage.repliedTo ?? undefined,
          forwardedFromMsgId: pendingMessage.forwardedFromMsgId ?? undefined,
        });

        notifyFlushed(Number(pendingMessage.conversationId));

        updateConversationPreview({
          id: Number(pendingMessage.conversationId),
          lastMessageText: result.data.text,
          lastMessageSentAt: result.data.sentAt,
        }).catch(() => {});

        remaining.shift();
      } catch {
        // Still offline or server unreachable — stop and retry later.
        break;
      }
    }

    if (remaining.length > 0) {
      scheduleRetry();
    } else {
      stopRetryTimer();
    }
  } finally {
    flushing = false;
  }
}

function stopRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushPendingMessages().catch((err) => {
      console.warn("Pending message flush retry failed:", err);
    });
  }, 5000);
}

/**
 * Wire up background sync: flush on connectivity restore, on app
 * foreground, and on a retry cadence. Safe to call multiple times.
 */
export function startPendingSync(): void {
  if (started) return;
  started = true;

  NetInfo.addEventListener((state) => {
    const online = !!state.isConnected && state.isInternetReachable !== false;
    if (online) {
      flushPendingMessages().catch(() => {});
    }
  });

  AppState.addEventListener("change", (status) => {
    if (status === "active") {
      flushPendingMessages().catch(() => {});
    }
  });

  flushPendingMessages().catch(() => {});
}
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { api } from "@/lib/api";
import { getToken } from "@/lib/secureStorage";
import {
  deletePendingMessage,
  getPendingMessages,
  saveMessage,
  updateConversationPreview,
} from "@/lib/db";

let started = false;
let flushing = false;
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
  listeners.forEach((listener) => listener({ conversationIds: [conversationId] }));
}

/**
 * Global flush of offline (pending) messages. Runs regardless of which
 * screen is open, so messages sent while offline are delivered as soon as
 * connectivity returns — even outside the chat screen.
 */
export async function flushPendingMessages(): Promise<void> {
  if (flushing) return;

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
        const result = await api.post("/api/conversations/messages", {
          messageText: pendingMessage.text,
          conversationId: pendingMessage.conversationId,
          nonce: pendingMessage.nonce,
        });

        if (result.data?.id == null) {
          throw new Error("No message id returned");
        }

        await saveMessage({
          messageId: result.data.id,
          message: result.data.text,
          sentAt: result.data.sentAt,
          SenderId: result.data.senderId,
          ConversationId: result.data.conversationId,
          nonce: result.data.nonce,
        });

        await deletePendingMessage({ messageId: pendingMessage.id });

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
    flushPendingMessages();
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
      flushPendingMessages();
    }
  });

  AppState.addEventListener("change", (status) => {
    if (status === "active") {
      flushPendingMessages();
    }
  });

  flushPendingMessages();
}

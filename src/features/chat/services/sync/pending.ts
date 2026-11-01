import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";
import { api } from "@/core/api";
import {
  decryptMessage,
  encryptMessage,
  getConversationKeyForEpoch,
  getCurrentConversationKey,
} from "@/core/crypto";
import { getToken } from "@/features/auth/services";
import {
  confirmPendingMessage,
  deletePendingMessage,
  getMessageByNonce,
  getPendingMessages,
  PendingMessage,
  updateConversationPreview,
  updatePendingMessageEncryption,
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

type PendingUpdatedListener = (info: {
  pendingId: number;
  conversationId: number;
  nonce: string;
}) => void;
const updatedListeners = new Set<PendingUpdatedListener>();

export function onPendingMessageUpdated(
  listener: PendingUpdatedListener,
): () => void {
  updatedListeners.add(listener);
  return () => {
    updatedListeners.delete(listener);
  };
}

function notifyPendingMessageUpdated(info: {
  pendingId: number;
  conversationId: number;
  nonce: string;
}) {
  updatedListeners.forEach((listener) => listener(info));
}

const DECRYPT_FAILED_TEXT = "[Encrypted Message]";
const reportedFailures = new Set<number>();

type PendingRotationResult =
  | { ok: true; message: string; nonce: string; keyEpoch: number }
  | { ok: false; reason: string };

function isEpochConflict(error: unknown): boolean {
  return (
    (error as { response?: { status?: number } })?.response?.status === 409
  );
}

function reportPendingFailure(pendingMessage: PendingMessage, reason: string) {
  if (reportedFailures.has(pendingMessage.id)) return;
  reportedFailures.add(pendingMessage.id);
  console.warn(
    `Pending message ${pendingMessage.id} left queued: ${reason}`,
  );
  Toast.show({
    type: "error",
    text1: "Queued message needs attention",
    text2:
      "It could not be updated after a key change and remains in the queue.",
  });
}

async function rotatePendingMessageToCurrentEpoch(
  pendingMessage: PendingMessage,
  keyEpoch: number,
): Promise<PendingRotationResult> {
  const oldKey = await getConversationKeyForEpoch(
    pendingMessage.conversationId,
    keyEpoch,
  );
  if (!oldKey) {
    return { ok: false, reason: "original epoch key is unavailable" };
  }

  const decrypted = await decryptMessage({
    encryptedMessage: pendingMessage.text,
    nonce: pendingMessage.nonce,
    decryptedConversationKey: oldKey,
  });
  if (decrypted.decryptMessage === DECRYPT_FAILED_TEXT) {
    return { ok: false, reason: "original ciphertext could not be decrypted" };
  }

  const current = await getCurrentConversationKey(
    pendingMessage.conversationId,
  );
  if (!current) {
    return { ok: false, reason: "current conversation key is unavailable" };
  }

  const encrypted = await encryptMessage({
    message: decrypted.decryptMessage,
    decryptedConversationKey: current.conversationKey,
  });

  const updated = await updatePendingMessageEncryption({
    messageId: pendingMessage.id,
    message: encrypted.encryptedMessage,
    nonce: encrypted.nonce,
    keyEpoch: current.epoch,
  });
  if (!updated) {
    return { ok: false, reason: "queued message could not be updated" };
  }

  notifyPendingMessageUpdated({
    pendingId: pendingMessage.id,
    conversationId: Number(pendingMessage.conversationId),
    nonce: encrypted.nonce,
  });

  return {
    ok: true,
    message: encrypted.encryptedMessage,
    nonce: encrypted.nonce,
    keyEpoch: current.epoch,
  };
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

        const storedKeyEpoch = pendingMessage.keyEpoch;
        if (
          typeof storedKeyEpoch !== "number" ||
          !Number.isInteger(storedKeyEpoch) ||
          storedKeyEpoch < 1
        ) {
          console.warn(
            "Skipping pending message with missing key epoch:",
            pendingMessage.id,
          );
          remaining.shift();
          continue;
        }

        let keyEpoch = storedKeyEpoch;
        let messageText = pendingMessage.text;
        let nonce = pendingMessage.nonce;
        let result;

        try {
          result = await api.post("/api/conversations/messages", {
            messageText,
            conversationId: pendingMessage.conversationId,
            nonce,
            replyToId: pendingMessage.replyToId ?? null,
            forwardedFromMsgId: pendingMessage.forwardedFromMsgId ?? null,
            keyEpoch,
          });
        } catch (err) {
          if (!isEpochConflict(err)) throw err;

          const rotated = await rotatePendingMessageToCurrentEpoch(
            pendingMessage,
            keyEpoch,
          );
          if (!rotated.ok) {
            reportPendingFailure(pendingMessage, rotated.reason);
            remaining.shift();
            continue;
          }

          keyEpoch = rotated.keyEpoch;
          messageText = rotated.message;
          nonce = rotated.nonce;

          try {
            result = await api.post("/api/conversations/messages", {
              messageText,
              conversationId: pendingMessage.conversationId,
              nonce,
              replyToId: pendingMessage.replyToId ?? null,
              forwardedFromMsgId: pendingMessage.forwardedFromMsgId ?? null,
              keyEpoch,
            });
          } catch (retryErr) {
            if (!isEpochConflict(retryErr)) throw retryErr;
            reportPendingFailure(
              pendingMessage,
              "conversation key changed again while retrying",
            );
            remaining.shift();
            continue;
          }
        }

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
          nonce,
          replyToId: pendingMessage.replyToId ?? undefined,
          repliedTo: pendingMessage.repliedTo ?? undefined,
          forwardedFromMsgId: pendingMessage.forwardedFromMsgId ?? undefined,
          keyEpoch,
        });

        reportedFailures.delete(pendingMessage.id);
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
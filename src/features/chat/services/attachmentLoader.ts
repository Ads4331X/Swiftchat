import { api, getBackendUrl } from "@/core/api";
import { getToken } from "@/features/auth/services";
import { decryptAttachment, readAttachmentHeader } from "@/core/crypto";
import {
  createAttachment,
  getAttachment,
  updateLocalPath,
} from "@/core/db/attachments";
import {
  checkAndCreateEncryptedFile,
  createAttachmentCacheFile,
} from "@/core/storage/attachmentFile";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";

type Attachment = NonNullable<Awaited<ReturnType<typeof getAttachment>>>;

// attachment load status shown in the UI.
export type AttachmentStatus =
  | "idle"
  | "downloading"
  | "processing"
  | "ready"
  | "error";

export type AttachmentState = {
  status: AttachmentStatus;
  progress: number; // 0..1, 1 when ready
  sourceUri: string | null;
  mimeType: string | null;
  fileSize: number | null;
  waveform: number[] | null;
  durationMs: number | null;
};

const IDLE_STATE: AttachmentState = {
  status: "idle",
  progress: 0,
  sourceUri: null,
  mimeType: null,
  fileSize: null,
  waveform: null,
  durationMs: null,
};

// module-level registry keyed by messageId, so one load is shared
// between the prefetch pass and every bubble (FlatList recycles cells).
const states = new Map<number, AttachmentState>();
const listeners = new Map<number, Set<(state: AttachmentState) => void>>();
const inflight = new Map<number, Promise<AttachmentState>>();

export function getAttachmentState(messageId: number): AttachmentState {
  return states.get(messageId) ?? IDLE_STATE;
}

export function subscribeAttachment(
  messageId: number,
  listener: (state: AttachmentState) => void,
): () => void {
  let set = listeners.get(messageId);
  if (!set) {
    set = new Set();
    listeners.set(messageId, set);
  }
  set.add(listener);
  listener(getAttachmentState(messageId)); // replay current state

  return () => {
    const current = listeners.get(messageId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(messageId);
  };
}

function emit(messageId: number, next: AttachmentState) {
  states.set(messageId, next);
  const set = listeners.get(messageId);
  if (!set) return;
  for (const listener of set) listener(next);
}

// loads (or joins) one attachment. Callers share a single download + decrypt.
export function ensureAttachmentLoaded({
  messageId,
  conversationId,
}: {
  messageId: number;
  conversationId: number;
}): Promise<AttachmentState> {
  const existing = states.get(messageId);
  if (existing?.status === "ready") return Promise.resolve(existing);

  const pending = inflight.get(messageId);
  if (pending) return pending;

  const promise = runLoad({ messageId, conversationId })
    .catch((err) => {
      console.error("loadAttachment failed", err);
      const failed: AttachmentState = {
        ...getAttachmentState(messageId),
        status: "error",
      };
      emit(messageId, failed);
      return failed;
    })
    .finally(() => {
      inflight.delete(messageId);
    });

  inflight.set(messageId, promise);
  return promise;
}

// warms attachments for a batch of messages, bounded concurrency.
export function prefetchAttachments(
  messages: {
    id: number;
    conversationId: number;
    attachment?: unknown;
  }[],
  concurrency = 3,
): Promise<void> {
  const targets = messages.filter((m) => {
    if (m.id == null || m.attachment == null) return false;
    // prefetch images only to bound bandwidth.
    const mime = (m.attachment as { mimeType?: string }).mimeType;
    return typeof mime === "string" && mime.startsWith("image/");
  });
  if (targets.length === 0) return Promise.resolve();

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++];
      try {
        await ensureAttachmentLoaded({
          messageId: target.id,
          conversationId: target.conversationId,
        });
      } catch {
        // error state is already recorded.
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, targets.length) },
    worker,
  );
  return Promise.all(workers).then(() => undefined);
}

async function runLoad({
  messageId,
  conversationId,
}: {
  messageId: number;
  conversationId: number;
}): Promise<AttachmentState> {
  let lastProgress = -1;
  const set = (patch: Partial<AttachmentState>): AttachmentState => {
    const next = { ...getAttachmentState(messageId), ...patch };
    emit(messageId, next);
    return next;
  };
  const reportDecrypt = (fraction: number) => {
    // throttle so we don't re-render per chunk.
    if (fraction - lastProgress < 0.02 && fraction < 1) return;
    lastProgress = fraction;
    set({ status: "processing", progress: Math.min(0.99, fraction) });
  };

  set({ status: "downloading", progress: 0 });

  let attachment = await getAttachment({ messageId });

  if (!attachment) {
    const response = await api.get(
      `api/conversations/attachments/${messageId}/metadata`,
    );
    if (!response.data) throw new Error("No attachment found");

    // server sends `encryptionHeader` (no uuid), so normalise it.
    const meta: any = response.data;
    const uuid: string = meta.uuid ?? Crypto.randomUUID();
    const encryptedHeader = meta.encryptedHeader ?? meta.encryptionHeader;

    await createAttachment({
      uuid,
      messageId: meta.messageId ?? messageId,
      localPath: null,
      mimeType: meta.mimeType,
      fileSize: meta.fileSize,
      encryptedKey: meta.encryptedKey,
      encryptedHeader,
      keyNonce: meta.keyNonce,
      headerNonce: meta.headerNonce,
    });

    attachment = {
      ...meta,
      uuid,
      messageId: meta.messageId ?? messageId,
      encryptedHeader,
    } as Attachment;
  }

  const mimeType = attachment.mimeType;
  const fileSize = attachment.fileSize ?? null;
  set({ mimeType, fileSize });

  // decrypted cache already on disk.
  const cacheFile = createAttachmentCacheFile(attachment.uuid, mimeType);
  if (cacheFile.exists) {
    const header = await readAttachmentHeader({
      messageId,
      conversationId,
      attachment,
    });
    return set({
      status: "ready",
      progress: 1,
      sourceUri: cacheFile.uri,
      waveform: header.waveform,
      durationMs: header.durationMs,
    });
  }

  const encryptedFile = checkAndCreateEncryptedFile(attachment.uuid);

  if (encryptedFile.exists) {
    set({ status: "processing", progress: 0 });
    // path is derived from uuid, so don't rely on persisted localPath.
    attachment.localPath = encryptedFile.uri;
    const decrypted = await decryptToCache({
      attachment,
      messageId,
      conversationId,
      encryptedSize: encryptedFile.size,
      onProgress: reportDecrypt,
    });
    return set({
      status: "ready",
      progress: 1,
      sourceUri: decrypted.uri,
      waveform: decrypted.waveform,
      durationMs: decrypted.durationMs,
    });
  }

  // download the encrypted file (streamed, axios can't).
  const token = await getToken("token");
  const response = await expoFetch(
    `${getBackendUrl()}/api/conversations/attachments/${messageId}`,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  if (!response.ok || !response.body) {
    throw new Error("Failed to download attachment");
  }

  const reader = response.body.getReader();
  const handle = encryptedFile.open();
  const total = typeof fileSize === "number" ? fileSize : 0;
  let received = 0;
  try {
    while (true) {
      // server bytes are already chunk-framed, write through unchanged.
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        handle.writeBytes(value);
        received += value.byteLength;
        if (total > 0) {
          set({
            status: "downloading",
            progress: Math.min(0.99, received / total),
          });
        }
      }
    }
  } finally {
    reader.releaseLock?.();
    handle.close();
  }

  // also set on the in-memory row for web where the update no-ops.
  attachment.localPath = encryptedFile.uri;
  await updateLocalPath({ localPath: encryptedFile.uri, messageId });

  set({ status: "processing", progress: 0 });
  const decrypted = await decryptToCache({
    attachment,
    messageId,
    conversationId,
    encryptedSize: received || encryptedFile.size,
    onProgress: reportDecrypt,
  });
  return set({
    status: "ready",
    progress: 1,
    sourceUri: decrypted.uri,
    waveform: decrypted.waveform,
    durationMs: decrypted.durationMs,
  });
}

async function decryptToCache({
  attachment,
  messageId,
  conversationId,
  encryptedSize,
  onProgress,
}: {
  attachment: Attachment;
  messageId: number;
  conversationId: number;
  encryptedSize: number;
  onProgress: (fraction: number) => void;
}): Promise<{
  uri: string;
  waveform: number[] | null;
  durationMs: number | null;
}> {
  const { cacheFile, waveform, durationMs } = await decryptAttachment({
    messageId,
    conversationId,
    attachment,
    encryptedSize,
    onProgress,
  });
  return {
    uri: cacheFile.uri,
    waveform: waveform ?? null,
    durationMs: durationMs ?? null,
  };
}

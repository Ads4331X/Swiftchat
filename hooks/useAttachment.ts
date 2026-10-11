import { api, getBackendUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { decryptImage } from "@/lib/crypto";
import {
  createAttachment,
  getAttachment,
  updateLocalPath,
} from "@/lib/db/attachments";
import {
  checkAndCreateEncryptedFile,
  createAttachmentCacheFile,
} from "@/lib/storage/attachmentFile";
import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import { fetch as expoFetch } from "expo/fetch";
type Attachment = NonNullable<Awaited<ReturnType<typeof getAttachment>>>;
type DecryptedAttachment = ReturnType<typeof createAttachmentCacheFile>;

export function useAttachment({
  conversationId,
  messageId,
  enabled,
}: {
  conversationId: number;
  messageId: number;
  enabled: boolean;
}) {
  const [decryptAttachment, setDecryptAttachment] =
    useState<DecryptedAttachment | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const loadAttachment = async () => {
      try {
        // gets the attachment metadata from local storage
        let attachment = await getAttachment({ messageId });

        // if attachment metadata is not in local storage fetch from the server
        if (!attachment) {
          const response = await api.get(
            `api/conversations/attachments/${messageId}/metadata`,
          );
          if (!response.data) throw new Error("No attachment found");

          // Server metadata: `encryptionHeader` (not `encryptedHeader`) and no
          // uuid, so normalise it and mint a stable local uuid for the file
          // names used below.
          const meta: any = response.data;
          const uuid: string = meta.uuid ?? Crypto.randomUUID();
          const encryptedHeader =
            meta.encryptedHeader ?? meta.encryptionHeader;

          // stores the attachment on local storage
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

          // sets the metadata fetched from the server to local table
          attachment = {
            ...meta,
            uuid,
            messageId: meta.messageId ?? messageId,
            encryptedHeader,
          } as Attachment;
        }
        setMimeType(attachment.mimeType);
        setFileSize(attachment.fileSize ?? null);

        // try to create a cache file
        const cacheFile = createAttachmentCacheFile(
          attachment.uuid,
          attachment.mimeType,
        );

        // if cache file exists (decrypted attachment alr exists locally)
        if (cacheFile.exists) {
          setDecryptAttachment(cacheFile);

          return;
        }

        // check if encrypted file is alr locally stored
        const encryptedFile = checkAndCreateEncryptedFile(attachment.uuid);
        if (encryptedFile.exists) {
          setDecryptAttachment(
            await decryptAttachmentFile({
              attachment,
              messageId,
              conversationId,
            }),
          );
        }
        // download the encrypted attachment from the server
        else {
          // `expo/fetch` streams the response body (axios cannot); the server
          // returns the raw encrypted bytes as octet-stream.
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
          try {
            while (true) {
              // The server file is already chunk-framed exactly as
              // `readChunk` expects, so write the raw bytes through unchanged
              // (do NOT re-frame with `writeAttachmentChunk`).
              const { done, value } = await reader.read();
              if (done) break;
              if (value) handle.writeBytes(value);
            }
          } finally {
            reader.releaseLock?.();
            handle.close();
          }

          // update the local path; also on the in-memory row so decryption
          // works even when the SQLite update no-ops (web).
          attachment.localPath = encryptedFile.uri;
          await updateLocalPath({ localPath: encryptedFile.uri, messageId });

          setDecryptAttachment(
            await decryptAttachmentFile({
              attachment,
              messageId,
              conversationId,
            }),
          );
        }

        // fetch the encrypted attachment file of no cache exists
      } catch (e) {
        console.error("loadAttachment failed", e);
      }
    };

    loadAttachment();
  }, [messageId, conversationId, enabled]);

  return {
    file: decryptAttachment,
    sourceUri: decryptAttachment?.uri ?? null,
    mimeType: decryptAttachment?.type ?? mimeType,
    fileSize,
  };
}

async function decryptAttachmentFile({
  attachment,
  messageId,
  conversationId,
}: {
  attachment: Attachment;
  messageId: number;
  conversationId: number;
}) {
  if (attachment.mimeType.startsWith("image/")) {
    return await decryptImage({ messageId, conversationId, attachment });
  }

  throw new Error("Unsupported attachment type");
}

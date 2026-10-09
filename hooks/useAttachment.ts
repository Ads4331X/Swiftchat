import { api } from "@/lib/api";
import { decryptImage } from "@/lib/crypto";
import {
  createAttachment,
  getAttachment,
  updateLocalPath,
} from "@/lib/db/attachments";
import {
  checkAndCreateEncryptedFile,
  createAttachmentCacheFile,
  createAttachmentFile,
  writeAttachmentChunk,
} from "@/lib/storage/attachmentFile";
import { File } from "expo-file-system";
import { useEffect, useState } from "react";
type Attachment = NonNullable<Awaited<ReturnType<typeof getAttachment>>>;

export function useAttachment({
  conversationId,
  messageId,
}: {
  conversationId: number;
  messageId: number;
}) {
  const [decryptAttachment, setDecryptAttachment] = useState<File | null>(null);
  useEffect(() => {
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

          // metadata of  attachment
          const meta: Attachment = response.data;

          // stores the attachment on local storage
          await createAttachment({
            uuid: meta.uuid,
            messageId: meta.messageId,
            localPath: null,
            mimeType: meta.mimeType,
            fileSize: meta.fileSize,
            encryptedKey: meta.encryptedKey,
            encryptedHeader: meta.encryptedHeader,
            keyNonce: meta.keyNonce,
            headerNonce: meta.headerNonce,
          });

          // sets the metadata fetched from the server to local table
          attachment = meta;
        }

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
          const response = await api.get(
            `api/conversations/attachments/${messageId}`,
          );

          const reader = response.data.body;
          const handle = encryptedFile.open();
          while (true) {
            // reads chunk by chunk
            const { done, value } = await reader.read();
            if (done) break;
            writeAttachmentChunk({ handle, encryptedChunk: value });
          }

          reader.releaseLock?.();
          handle.close();

          // update the local path
          await updateLocalPath({
            localPath: encryptedFile.uri,
            messageId,
          });

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
  }, [messageId, conversationId]);

  return { file: decryptAttachment };
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
    return await decryptImage({ messageId, conversationId });
  }

  throw new Error("Unsupported attachment type");
}

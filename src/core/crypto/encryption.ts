import sodiumModule from "@/core/crypto/sodium";
import { Base64 } from "js-base64";
import { createChunk } from "@/features/attachments/services/chunk/createChunk";
import { readChunk } from "@/features/attachments/services/chunk/readChunk";
import {
  createAttachmentCacheFile,
  createAttachmentFile,
  openAttachmentFile,
  writeAttachmentCacheChunk,
  writeAttachmentChunk,
} from "@/core/storage/attachmentFile";
import { openSourceFile } from "@/core/storage/sourceFile";
import { getAttachment } from "@/core/db/attachments";
import { getConversationKeyCache } from "@/core/db";
import { getInMemoryConversationKey } from "@/core/crypto/keys/conversation";
import {
  ATTACHMENT_KEYBYTES,
  ATTACHMENT_PREFIXBYTES,
  DECRYPT_YIELD_INTERVAL,
  buildChunkNonce,
  encodeUtf8,
  sealChunk,
  tryOpenChunk,
  yieldToEventLoop,
} from "@/core/crypto/helpers";
const sodium = (sodiumModule as any).default ?? sodiumModule;

// re-export so @/core/crypto still exposes encodeUtf8.
export { encodeUtf8 } from "@/core/crypto/helpers";

type AttachmentRow = NonNullable<Awaited<ReturnType<typeof getAttachment>>>;

/**
 * Resolve the raw conversation key for attachment crypto. Prefers the persisted
 * (SQLite) cache, then falls back to the in-memory cache populated this session.
 * The fallback is essential on web, where the SQLite cache is often disabled.
 */
async function resolveConversationKey(
  conversationId: number,
): Promise<Uint8Array | null> {
  const keyBase64 = await getConversationKeyCache(conversationId);
  if (keyBase64) return Base64.toUint8Array(keyBase64);

  return getInMemoryConversationKey(conversationId);
}

export async function encryptMessage({
  message,
  decryptedConversationKey,
}: {
  message: string;
  decryptedConversationKey: Uint8Array;
}) {
  await sodium.ready;
  // creates a random 24 bytes (unit8array) nonce
  const nonce = sodium.randombytes_buf(24);

  // convert the message to bytes (unit8array)
  const messageBytes = encodeUtf8(message);
  // encrypts the message using unit8array message, nonce and decrypted conversation key
  const encryptMessage = sodium.crypto_secretbox_easy(
    messageBytes,
    nonce,
    decryptedConversationKey,
  );

  // encode the encryptes message and nonce to base64
  const encryptMessageToString = Base64.fromUint8Array(encryptMessage);
  const nonceToString = Base64.fromUint8Array(nonce);

  return { encryptedMessage: encryptMessageToString, nonce: nonceToString }; // returns the encoded message and nonce
}

export async function decryptMessage({
  encryptedMessage,
  nonce,
  decryptedConversationKey,
}: {
  encryptedMessage: string;
  nonce: string;
  decryptedConversationKey: Uint8Array;
}) {
  await sodium.ready;
  try {
    // converts the base64 encrypted message and nonce to unit8array
    const encryptedMessageToArray8 = Base64.toUint8Array(encryptedMessage);
    const nonceToArray8 = Base64.toUint8Array(nonce);

    // decrypt the message using unit8array decrypted conversation key, encryptedMessageToArray8 and nonce
    const decryptMessage = sodium.crypto_secretbox_open_easy(
      encryptedMessageToArray8,
      nonceToArray8,
      decryptedConversationKey,
    );

    return { decryptMessage: sodium.to_string(decryptMessage) }; // returns the decrypted message
  } catch {
    return { decryptMessage: "[Encrypted Message]" }; // if decryption fails return place holder
  }
}

export async function encryptAttachment({
  uri,
  conversationId,
  caption,
}: {
  uri: string;
  conversationId: number;
  caption?: string;
}) {
  const attachmentFile = createAttachmentFile(); // creates a file to store the encrypted attachment

  const handle = attachmentFile.file.open();
  await sodium.ready;
  // creates a random 256 bit key (32 bytes)
  const randomBytes = sodium.randombytes_buf(ATTACHMENT_KEYBYTES);
  const prefix = sodium.randombytes_buf(ATTACHMENT_PREFIXBYTES);

  const { reader, mimeType } = await openSourceFile(uri);
  let index = 0;
  try {
    while (true) {
      const chunk = await createChunk({ reader, bufferSize: 1024 * 1024 });
      const nonce = buildChunkNonce(prefix, index, chunk.isFinal);
      const encryptedChunk = sealChunk(chunk.chunk, nonce, randomBytes);
      // appends the chunk to the file
      writeAttachmentChunk({
        encryptedChunk,
        handle,
      });
      index++;

      if (chunk.isFinal) break;

      await yieldToEventLoop();
    }
  } finally {
    handle.close();
  }

  const conversationKey = await resolveConversationKey(conversationId);

  if (!conversationKey) {
    throw new Error("Conversation key not found");
  }

  const { encryptedMessage: encryptedText, nonce } = await encryptMessage({
    message: caption?.trim() ?? "",
    decryptedConversationKey: conversationKey,
  });

  const base64Header = Base64.fromUint8Array(prefix);

  // encrypt the header
  const { encryptedMessage: encryptedHeader, nonce: headerNonce } =
    await encryptMessage({
      message: base64Header,
      decryptedConversationKey: conversationKey,
    });

  const base64RandomBytes = Base64.fromUint8Array(randomBytes);

  // encrypt the secret key
  const { encryptedMessage: encryptedSecretKey, nonce: secretKeyNonce } =
    await encryptMessage({
      message: base64RandomBytes,
      decryptedConversationKey: conversationKey,
    });

  return {
    encryptedAttachmentUri: attachmentFile.file.uri,
    encryptedKey: encryptedSecretKey,
    keyNonce: secretKeyNonce,
    encryptedHeader,
    headerNonce,
    uuid: attachmentFile.uuid,
    mimeType,
    fileSize: attachmentFile.file.size,

    encryptedText,
    nonce,
  };
}

export async function decryptAttachment({
  messageId,
  conversationId,
  attachment,
  encryptedSize,
  onProgress,
}: {
  messageId: number;
  conversationId: number;
  attachment?: AttachmentRow; // skips a SQLite re-read
  encryptedSize?: number; // encrypted size, for progress
  onProgress?: (fraction: number) => void; // 0..1 decrypt progress
}) {
  await sodium.ready;

  const attachmentData = attachment ?? (await getAttachment({ messageId }));
  const conversationKey = await resolveConversationKey(conversationId);

  if (!conversationKey || !attachmentData || !attachmentData.localPath) {
    console.warn("decryptAttachment could not find", {
      keyFound: !!conversationKey,
      attachmentFound: !!attachmentData,
      localPath: attachmentData?.localPath,
    });
    throw new Error("data not found");
  }

  const cacheFile = createAttachmentCacheFile(
    attachmentData.uuid,
    attachmentData.mimeType,
  );

  const cacheHandle = cacheFile.open();
  // decrypts the attachment secret key
  const { decryptMessage: decryptedSecretKey } = await decryptMessage({
    encryptedMessage: attachmentData.encryptedKey,
    nonce: attachmentData.keyNonce,
    decryptedConversationKey: conversationKey,
  });

  // decrypts the attachment header
  const { decryptMessage: decryptedHeader } = await decryptMessage({
    encryptedMessage: attachmentData.encryptedHeader,
    nonce: attachmentData.headerNonce,
    decryptedConversationKey: conversationKey,
  });

  const attachmentHandle = await openAttachmentFile({
    localPath: attachmentData.localPath,
  });

  const prefix = Base64.toUint8Array(decryptedHeader);
  const secretKey = Base64.toUint8Array(decryptedSecretKey);

  if (prefix.length !== 16 || secretKey.length !== 32) {
    throw new Error("Invalid attachment encryption metadata");
  }

  // estimate chunk count from the encrypted size for progress.
  const estimatedChunks =
    encryptedSize && encryptedSize > 0
      ? Math.max(1, Math.ceil(encryptedSize / (1024 * 1024)))
      : 0;

  let index = 0;
  try {
    while (true) {
      // reads (gets) the encrypted chunk from the file
      const encryptedChunk = await readChunk({
        attachmentHandle,
      });

      if (encryptedChunk === null) {
        throw new Error("Attachment is missing its final chunk");
      }

      // decrypts the attachment chunk
      let plain = tryOpenChunk(
        encryptedChunk,
        buildChunkNonce(prefix, index, false),
        secretKey,
      );
      let isFinal = false;
      if (!plain) {
        plain = tryOpenChunk(
          encryptedChunk,
          buildChunkNonce(prefix, index, true),
          secretKey,
        );
        isFinal = true;
      }
      if (!plain) throw new Error("Decryption of attachment chunks failed");

      writeAttachmentCacheChunk({ handle: cacheHandle, chunk: plain });
      index++;

      if (onProgress && estimatedChunks > 0) {
        onProgress(Math.min(0.99, index / estimatedChunks));
      }

      if (isFinal) break;

      // yield every few chunks so the UI stays responsive.
      if (index % DECRYPT_YIELD_INTERVAL === 0) {
        await yieldToEventLoop();
      }
    }
  } finally {
    cacheHandle.close();
    attachmentHandle.close();
  }

  return cacheFile;
}

import sodiumModule from "./sodium";
import { Base64 } from "js-base64";
import { createChunk } from "@/lib/chunk/createChunk";
import { readChunk } from "@/lib/chunk/readChunk";
import {
  createAttachmentCacheFile,
  createAttachmentFile,
  openAttachmentFile,
  writeAttachmentCacheChunk,
  writeAttachmentChunk,
} from "../storage/attachmentFile";
import { openSourceFile } from "../storage/sourceFile";
import { getAttachment } from "../db/attachments";
import { getConversationKeyCache } from "../db";
import { getInMemoryConversationKey } from "./keys/conversation";
const sodium = (sodiumModule as any).default ?? sodiumModule;

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

// Encryption runs synchronously on the JS thread; yielding between chunks lets
// React process events/state so the UI does not freeze during large files.
function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
// import sodium, { StateAddress } from "libsodium-wrappers";
// converts a string to Uint8Array
export function encodeUtf8(str: string): Uint8Array {
  if (typeof sodium.from_string === "function") {
    return sodium.from_string(str); // uses libsodium to convert string to bytes
  }
  return new TextEncoder().encode(str); // uses js textencoder to convert string to bytes
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

const IMG_KEYBYTES = 32;
const IMG_PREFIXBYTES = 16;

function buildChunkNonce(
  prefix: Uint8Array,
  index: number,
  isFinal: boolean,
): Uint8Array {
  const nonce = new Uint8Array(24);
  nonce.set(prefix, 0);
  new DataView(nonce.buffer).setUint32(16, index, true);
  nonce[20] = isFinal ? 1 : 0;
  return nonce;
}

function tryOpenChunk(
  chunk: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array | null {
  try {
    return sodium.crypto_secretbox_open_easy(chunk, nonce, key) || null;
  } catch {
    return null;
  }
}

export async function encryptImage({
  uri,
  conversationId,
  caption,
}: {
  uri: string;
  conversationId: number;
  caption?: string;
}) {
  const imgFile = createAttachmentFile(); // creates a file to store the encrypted image
  console.log(
    "encryptImage conversationId:",
    conversationId,
    typeof conversationId,
  );
  const handle = imgFile.file.open();
  await sodium.ready;
  // creates a random 256 bit key (32 bytes)
  const randomBytes = sodium.randombytes_buf(IMG_KEYBYTES);
  const prefix = sodium.randombytes_buf(IMG_PREFIXBYTES);

  const { reader, mimeType } = await openSourceFile(uri);
  let index = 0;
  try {
    while (true) {
      const imgChunk = await createChunk({ reader, bufferSize: 1024 * 1024 });
      const nonce = buildChunkNonce(prefix, index, imgChunk.isFinal);
      const encryptImgChunk = sodium.crypto_secretbox_easy(
        imgChunk.chunk,
        nonce,
        randomBytes,
      );
      // appends the chunk to the file
      writeAttachmentChunk({
        encryptedChunk: encryptImgChunk,
        handle,
      });
      index++;

      if (imgChunk.isFinal) break;

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
    encryptedImageUri: imgFile.file.uri,
    encryptedKey: encryptedSecretKey,
    keyNonce: secretKeyNonce,
    encryptedHeader,
    headerNonce,
    uuid: imgFile.uuid,
    mimeType,
    fileSize: imgFile.file.size,

    encryptedText,
    nonce,
  };
}

export async function decryptImage({
  messageId,
  conversationId,
  attachment,
}: {
  messageId: number;
  conversationId: number;
  /** Attachment row; avoids a (possibly unavailable on web) SQLite re-read. */
  attachment?: AttachmentRow;
}) {
  await sodium.ready;

  const image = attachment ?? (await getAttachment({ messageId }));
  const conversationKey = await resolveConversationKey(conversationId);

  if (!conversationKey || !image || !image.localPath) {
    console.warn(
      "decryptImage could not find",
      { keyFound: !!conversationKey, imageFound: !!image, localPath: image?.localPath },
    );
    throw new Error("data not found");
  }

  const cacheFile = createAttachmentCacheFile(image.uuid, image.mimeType);

  const cacheHandle = cacheFile.open();
  // decrypts image secret key
  const { decryptMessage: decryptImgSecretKey } = await decryptMessage({
    encryptedMessage: image.encryptedKey,
    nonce: image.keyNonce,
    decryptedConversationKey: conversationKey,
  });

  // decrypts image header
  const { decryptMessage: decryptImgHeader } = await decryptMessage({
    encryptedMessage: image.encryptedHeader,
    nonce: image.headerNonce,
    decryptedConversationKey: conversationKey,
  });

  const handleImgFile = await openAttachmentFile({
    localPath: image.localPath,
  });

  const prefix = Base64.toUint8Array(decryptImgHeader);
  const secretKey = Base64.toUint8Array(decryptImgSecretKey);

  let index = 0;
  try {
    while (true) {
      // reads (gets) the encrypted chunk from the file
      const encryptedChunk = await readChunk({
        attachmentHandle: handleImgFile,
      });

      // decrypts the img chunk
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
      if (!plain) throw new Error("Decryption of image chunks failed");

      writeAttachmentCacheChunk({ handle: cacheHandle, chunk: plain });
      index++;

      if (isFinal) break;

      await yieldToEventLoop();
    }
  } finally {
    cacheHandle.close();
    handleImgFile.close();
  }

  return cacheFile;
}

import { File } from "expo-file-system";
import sodiumModule from "./sodium";
import { Base64 } from "js-base64";
import { createChunk, readChunk } from "@/lib/chunk/createChunk";
import {
  createAttachmentCacheFile,
  createAttachmentFile,
  openAttachmentFile,
  writeAttachmentCacheChunk,
  writeAttachmentChunk,
} from "../storage/attachmentFile";
import { createAttachment, getAttachment } from "../db/attachments";
import { getConversationKeyCache } from "../db";
const sodium = (sodiumModule as any).default ?? sodiumModule;
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
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

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

type SecretStreamState = ReturnType<
  typeof sodium.crypto_secretstream_xchacha20poly1305_init_push
>["state"];

export async function encryptChunk({
  chunk,
  state,
  tag,
}: {
  chunk: Uint8Array;
  state: SecretStreamState;
  tag: number;
}) {
  await sodium.ready;

  const encrypt = sodium.crypto_secretstream_xchacha20poly1305_push(
    state,
    chunk,
    null,
    tag,
  );

  return encrypt;
}

export async function encryptImage({
  uri,
  messageId,
  conversationId,
}: {
  uri: string;
  messageId: number;
  conversationId: number;
}) {
  const imgFile = createAttachmentFile(); // creates a file to store the encrypted image

  const handle = imgFile.file.open();
  await sodium.ready;
  // creates a random 256 bit key (32 bytes)
  const randomBytes = sodium.randombytes_buf(
    sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES,
  );

  // initialize the stream
  const secretStream =
    sodium.crypto_secretstream_xchacha20poly1305_init_push(randomBytes);

  const state = secretStream.state;
  const header = secretStream.header;

  const img = new File(uri);
  const stream = img.readableStream(); // inits a stream
  const reader = stream.getReader();
  while (true) {
    const imgChunk = await createChunk({ reader, bufferSize: 1024 * 1024 });
    const encryptImgChunk = await encryptChunk({
      chunk: imgChunk.chunk,
      state,
      tag: imgChunk.isFinal
        ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE,
    });
    // appends the chunk to the file
    writeAttachmentChunk({
      encryptedChunk: encryptImgChunk,
      handle,
    });

    if (imgChunk.isFinal) {
      handle.close();
      break;
    }
  }

  const keyBase64 = await getConversationKeyCache(conversationId);

  if (!keyBase64) {
    throw new Error("Conversation key not found");
  }
  const conversationKey = Base64.toUint8Array(keyBase64);

  const base64Header = Base64.fromUint8Array(header);

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
  await createAttachment({
    messageId,
    localPath: imgFile.file.uri,
    mimeType: img.type,
    fileSize: imgFile.file.size,
    encryptedKey: encryptedSecretKey,
    encryptedHeader: encryptedHeader,
    headerNonce,
    keyNonce: secretKeyNonce,
    uuid: imgFile.uuid,
  });

  return {
    encryptedImageUri: imgFile.file.uri,
    encryptedKey: encryptedSecretKey,
    keyNonce: secretKeyNonce,
    encryptedHeader,
    headerNonce,
  };
}

export async function decryptChunk({
  encryptedChunk,
  state,
}: {
  encryptedChunk: Uint8Array;
  state: SecretStreamState;
}) {
  await sodium.ready;

  const decrypt = await sodium.crypto_secretstream_xchacha20poly1305_pull(
    state,
    encryptedChunk,
    null,
  );

  if (!decrypt) {
    throw Error("Decryption of image chunks failed");
  }

  return { tag: decrypt.tag, message: decrypt.message };
}

export async function decryptImage({
  messageId,
  conversationId,
}: {
  messageId: number;
  conversationId: number;
}) {
  await sodium.ready;

  const image = await getAttachment({ messageId });
  const keyBase64 = await getConversationKeyCache(conversationId);

  if (!keyBase64 || !image || !image.localPath) {
    throw new Error("data not found");
  }
  const conversationKey = Base64.toUint8Array(keyBase64);

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

  const header = Base64.toUint8Array(decryptImgHeader);
  const secretKey = Base64.toUint8Array(decryptImgSecretKey);
  const initPull = sodium.crypto_secretstream_xchacha20poly1305_init_pull(
    header,
    secretKey,
  );

  while (true) {
    // reads (gets) the encrypted chunk from the file
    const encryptedChunk = await readChunk({
      attachmentHandle: handleImgFile,
    });

    // decrypts the img chunk
    const { tag, message: decryptedChunk } = await decryptChunk({
      encryptedChunk,
      state: initPull,
    });

    writeAttachmentCacheChunk({ handle: cacheHandle, chunk: decryptedChunk });

    if (tag === sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL) break;
  }
  cacheHandle.close();
  handleImgFile.close();

  return cacheFile;
}

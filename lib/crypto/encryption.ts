import sodiumModule from "./sodium";
import { Base64 } from "js-base64";
const sodium = (sodiumModule as any).default ?? sodiumModule;
// import sodium from "libsodium-wrappers";
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

export async function encryptImage({ image }: { image: Uint8Array }) {
  await sodium.ready;

  // creates a random 256 bit key
  const randomBytes = sodium.randombytes_buf(
    sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES,
  );

  // initialize the stream
  const secretStream =
    sodium.crypto_secretstream_xchacha20poly1305_init_push(randomBytes);

  const header = secretStream.header;
  const state = secretStream.state;

  // const encryptedImage =
  //   sodium.crypto_secretstream_xchacha20poly1305_push(state);
}

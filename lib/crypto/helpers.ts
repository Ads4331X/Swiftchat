import sodiumModule from "./sodium";

const sodium = (sodiumModule as any).default ?? sodiumModule;

// 256-bit key and 128-bit prefix for chunked attachments.
export const ATTACHMENT_KEYBYTES = 32;
export const ATTACHMENT_PREFIXBYTES = 16;

// yield every N chunks so the UI stays responsive.
export const DECRYPT_YIELD_INTERVAL = 8;

// yield to the event loop so React can paint.
export function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// converts a string to Uint8Array.
export function encodeUtf8(str: string): Uint8Array {
  if (typeof sodium.from_string === "function") {
    return sodium.from_string(str); // uses libsodium to convert string to bytes
  }
  return new TextEncoder().encode(str); // uses js textencoder to convert string to bytes
}

// builds the 24-byte nonce: 16-byte prefix + chunk index + final flag.
export function buildChunkNonce(
  prefix: Uint8Array,
  index: number,
  isFinal: boolean,
): Uint8Array {
  if (prefix.length !== 16) {
    throw new Error("Invalid attachment nonce prefix");
  }

  if (!Number.isSafeInteger(index) || index < 0 || index > 0xffffffff) {
    throw new Error("Attachment chunk index out of range");
  }

  const nonce = new Uint8Array(24);
  nonce.set(prefix, 0);

  new DataView(nonce.buffer).setUint32(16, index, true);
  nonce[20] = isFinal ? 1 : 0;

  return nonce;
}

// decrypts a chunk, returns null if auth fails.
export function tryOpenChunk(
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

// encrypts a single chunk.
export function sealChunk(
  chunk: Uint8Array,
  nonce: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  return sodium.crypto_secretbox_easy(chunk, nonce, key);
}

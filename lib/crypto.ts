import sodiumModule from "./sodium";
// import sodium from "react-native-libsodium";
import { Base64 } from "js-base64";
import { api } from "./api";
import {
  getPrivateKey,
  getPublicKey,
  setPrivateKey,
  setPublicKey,
} from "./secureStorage";
const sodium = (sodiumModule as any).default ?? sodiumModule;

export async function generateKeyPair() {
  await sodium.ready;

  if (typeof sodium.crypto_box_keypair !== "function") {
    throw new Error("libsodium crypto_box_keypair is unavailable in this runtime");
  }

  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey, privateKey };
}

export async function initializeKeys() {
  let privateKey = await getPrivateKey("privateKey");
  let publicKey = await getPublicKey("publicKey");

  if (!privateKey || !publicKey) {
    const generated = await generateKeyPair();
    const base64PublicKey = Base64.fromUint8Array(generated.publicKey);
    const base64PrivateKey = Base64.fromUint8Array(generated.privateKey);

    await setPublicKey("publicKey", base64PublicKey);
    await setPrivateKey("privateKey", base64PrivateKey);

    publicKey = await getPublicKey("publicKey");
    privateKey = await getPrivateKey("privateKey");
  }

  if (!publicKey || !privateKey) {
    throw new Error("Failed to initialize encryption keys");
  }

  await api.put("/api/user/public-key", { publicKey });
  return { publicKey, privateKey };
}

export async function generateConversationKey() {
  await sodium.ready;
  const conversationKey = sodium.randombytes_buf(32);
  return conversationKey;
}

export async function generateEncryptedKey({
  conversationKey,
  receiverPublicKey,
  senderPrivateKey,
}: {
  conversationKey: Uint8Array;
  receiverPublicKey: Uint8Array;
  senderPrivateKey: Uint8Array;
}) {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const encryptedKey = sodium.crypto_box_easy(
    conversationKey,
    nonce,
    receiverPublicKey,
    senderPrivateKey,
  );

  return { encryptedKey, nonce };
}

export async function getEncryptedConversationKey(conversationId: string) {
  const response = await api.get(`/api/conversations/${conversationId}/key`);

  return {
    encryptedConversationKey: response.data.encryptedConversationKey,
    nonce: response.data.nonce,
    createdById: response.data.createdById,
  };
}

export async function decryptConversationKey({
  encryptedConversationKey,
  nonce,
  receiverPrivateKey,
  senderPublicKey,
}: {
  encryptedConversationKey: Uint8Array;
  nonce: Uint8Array;
  receiverPrivateKey: Uint8Array;
  senderPublicKey: Uint8Array;
}) {
  await sodium.ready;

  const conversationKey = sodium.crypto_box_open_easy(
    encryptedConversationKey,
    nonce,
    senderPublicKey,
    receiverPrivateKey,
  );

  return { conversationKey };
}

/**
 * Ensures a conversation key exists (creating + distributing it if this is
 * the first time anyone has opened this conversation), then returns the
 * decrypted key ready to use. This is the ONLY function screens should call —
 * it replaces separately calling encrypt-then-decrypt in two places.
 */
export async function getOrCreateConversationKey(
  conversationId: string,
  memberIds: number[],
) {
  await initializeKeys();

  // 1. Try to fetch an existing key for this conversation
  const { encryptedConversationKey, nonce, createdById } =
    await getEncryptedConversationKey(conversationId);

  // 2. If it already exists, decrypt and return it
  if (encryptedConversationKey && nonce && createdById) {
    const receiverPrivateKey = await getPrivateKey("privateKey");
    if (!receiverPrivateKey) {
      throw new Error("Private key not found");
    }

    const senderPublicKeyResponse = await api.get(
      `/api/user/${createdById}/public-key`,
    );

    const { conversationKey } = await decryptConversationKey({
      encryptedConversationKey: Base64.toUint8Array(encryptedConversationKey),
      nonce: Base64.toUint8Array(nonce),
      receiverPrivateKey: Base64.toUint8Array(receiverPrivateKey),
      senderPublicKey: Base64.toUint8Array(
        senderPublicKeyResponse.data.publicKey,
      ),
    });

    return conversationKey;
  }

  // 3. Doesn't exist yet — generate one and distribute it to every member
  const conversationKey = await generateConversationKey();

  for (const memberId of memberIds) {
    const publicKeyResponse = await api.get(`/api/user/${memberId}/public-key`);
    const senderPrivateKey = await getPrivateKey("privateKey");
    if (!senderPrivateKey) {
      throw new Error("Private key not found");
    }

    const { encryptedKey, nonce: keyNonce } = await generateEncryptedKey({
      conversationKey,
      receiverPublicKey: Base64.toUint8Array(publicKeyResponse.data.publicKey),
      senderPrivateKey: Base64.toUint8Array(senderPrivateKey),
    });

    await api.put(`/api/conversations/${conversationId}/key/${memberId}`, {
      encryptedKey: Base64.fromUint8Array(encryptedKey),
      nonce: Base64.fromUint8Array(keyNonce),
    });
  }

  return conversationKey;
}

export async function encryptMessage({
  message,
  decryptedConversationKey,
}: {
  message: string;
  decryptedConversationKey: Uint8Array;
}) {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

  const encryptMessage = sodium.crypto_secretbox_easy(
    message,
    nonce,
    decryptedConversationKey,
  );

  const encryptMessageToString = Base64.fromUint8Array(encryptMessage);
  const nonceToString = Base64.fromUint8Array(nonce);

  return { encryptedMessage: encryptMessageToString, nonce: nonceToString };
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
  const encryptedMessageToArray8 = Base64.toUint8Array(encryptedMessage);
  const nonceToArray8 = Base64.toUint8Array(nonce);

  const decryptMessage = sodium.crypto_secretbox_open_easy(
    encryptedMessageToArray8,
    nonceToArray8,
    decryptedConversationKey,
  );

  return { decryptMessage: new TextDecoder().decode(decryptMessage) };
}

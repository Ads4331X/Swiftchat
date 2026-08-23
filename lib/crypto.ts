// lib/crypto.ts
// import sodiumModule from "./sodium";
import sodium from "react-native-libsodium";
import { Base64 } from "js-base64";
import { api } from "./api";
import {
  getPrivateKey,
  getPublicKey,
  setPrivateKey,
  setPublicKey,
} from "./secureStorage";
// const sodium = (sodiumModule as any).default ?? sodiumModule;

export async function generateKeyPair() {
  await sodium.ready;
  console.log(Object.keys(sodium));
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey, privateKey };
}

export async function initializeKeys() {
  const checkPrivateKey = await getPrivateKey("privateKey");
  if (!checkPrivateKey) {
    const { publicKey, privateKey } = await generateKeyPair();
    const base64PublicKey = Base64.fromUint8Array(publicKey);
    const base64PrivateKey = Base64.fromUint8Array(privateKey);
    await setPublicKey("publicKey", base64PublicKey);
    await setPrivateKey("privateKey", base64PrivateKey);
  }
  const publicKey = await getPublicKey("publicKey");
  await api.put("/api/user/public-key", { publicKey });
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
  console.log(Object.keys(sodium));
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
  };
}

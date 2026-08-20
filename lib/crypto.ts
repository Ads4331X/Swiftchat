import sodium from "react-native-libsodium";
import { Base64 } from "js-base64";
import { api } from "./api";
import {
  getPrivateKey,
  getPublicKey,
  setPrivateKey,
  setPublicKey,
} from "./secureStorage";
export async function generateKeyPair() {
  await sodium.ready;
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
  await api.put("/api/user/public-key", {
    publicKey: publicKey,
  });
}

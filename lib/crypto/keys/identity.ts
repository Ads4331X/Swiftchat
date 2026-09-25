import sodiumModule from "../sodium";
import { Base64 } from "js-base64";
import nacl from "tweetnacl";
import { api } from "@/lib/api";
import {
  getPrivateKey,
  getPublicKey,
  setPrivateKey,
  setPublicKey,
} from "@/lib/auth";
import { recoverPrivateKey } from "../recovery";
import { getIdentityKeyNames } from "./identityStorage";

const sodium = (sodiumModule as any).default ?? sodiumModule;

export type EnsureKeysResult =
  | { ok: true; brandNew: boolean }
  | { ok: false; reason: "pinNeeded" }
  | { ok: false; reason: "lost" };

// generate public and private key pairs for the user
export async function generateKeyPair() {
  await sodium.ready;

  if (typeof sodium.crypto_box_keypair !== "function") {
    throw new Error(
      "libsodium crypto_box_keypair is unavailable in this runtime",
    );
  }

  return sodium.crypto_box_keypair();
}

// look up if server has the user's private key as backup ( encrypted private key)
export async function hasKeyBackup(): Promise<boolean> {
  try {
    const backup = await api.get("/api/user/key-backup");
    return Boolean(backup?.data?.keyBackupEncrypted);
  } catch {
    return false;
  }
}

// generate the public key with user's private key
async function syncPublicKeyFromPrivateKey(
  privateKey: Uint8Array,
  publicKeyName: string,
): Promise<string> {
  // converts the generated unit8array public key to base64
  const publicKey = Base64.fromUint8Array(
    await derivePublicKeyFromPrivateKey(privateKey),
  );
  // store the keys in storage
  await setPublicKey(publicKeyName, publicKey);
  return publicKey;
}
export async function derivePublicKeyFromPrivateKey(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  return nacl.box.keyPair.fromSecretKey(privateKey).publicKey; // returns in unit8array format
}

async function loadLocalIdentityKeys() {
  const { privateKeyName, publicKeyName } = await getIdentityKeyNames(); // gets the storage names for this user's keys
  // gets the key pair of the user
  let privateKey = await getPrivateKey(privateKeyName);
  let publicKey = await getPublicKey(publicKeyName);

  // if public key is not found
  if (privateKey && !publicKey) {
    try {
      publicKey = await syncPublicKeyFromPrivateKey(
        Base64.toUint8Array(privateKey),
        publicKeyName,
      );
    } catch {}
  }

  return { privateKeyName, publicKeyName, privateKey, publicKey };
}

export async function ensureLocalKeys(): Promise<EnsureKeysResult> {
  // loads the key pair of user stored on the device locally
  const { privateKeyName, publicKeyName, privateKey, publicKey } =
    await loadLocalIdentityKeys();

  // if key pair exists sync  with the server
  if (privateKey && publicKey) {
    await api.put("/api/user/public-key", { publicKey }).catch(() => {});
    return { ok: true, brandNew: false }; // no new key was generated and setup of keys completed successfully
  }

  // check if server has the users private key backup (encrypted ver)
  if (await hasKeyBackup()) {
    return { ok: false, reason: "pinNeeded" }; // to decrypt the message pin is needed and stop the key setup
  }

  let serverPublicKey: string | undefined;
  try {
    // to get the public key stored in the server
    const details = await api.get("/api/user/user-details");
    serverPublicKey = details.data.publicKey ?? undefined;
  } catch {
    return { ok: false, reason: "lost" }; // could not get the server public key
  }

  // if server has public keys but the local device doesn't have the keys stored
  if (serverPublicKey) {
    return { ok: false, reason: "lost" };
  }
  // generate a key pair for the user
  const generated = await generateKeyPair();
  // convert the key pari to base64
  const publicKeyBase64 = Base64.fromUint8Array(generated.publicKey);
  const privateKeyBase64 = Base64.fromUint8Array(generated.privateKey);
  // setup the key pairs on local storage
  await setPublicKey(publicKeyName, publicKeyBase64);
  await setPrivateKey(privateKeyName, privateKeyBase64);
  // update the public key of the user
  await api
    .put("/api/user/public-key", { publicKey: publicKeyBase64 })
    .catch(() => {});

  return { ok: true, brandNew: true };
}

export async function initializeKeys(pin: string) {
  // loads the key pair of user stored on the device locally
  const { privateKeyName, publicKeyName, privateKey, publicKey } =
    await loadLocalIdentityKeys();

  // if key pair exists the return it
  if (privateKey && publicKey) {
    return { publicKey, privateKey };
  }

  // trying to recover the private key from the pin
  const recovered = await recoverPrivateKey({ password: pin });
  if (!recovered) {
    throw new Error("Invalid recovery PIN");
  }

  // if revocery pin is correct then derive a publickey from the recovered private key and encode it to base64
  const derivedPublicKey = Base64.fromUint8Array(
    await derivePublicKeyFromPrivateKey(recovered),
  );

  // gets the public key of the user from the server and check if the derived public key matches with the user's public key in the server
  let serverPublicKey: string | undefined;
  try {
    const details = await api.get("/api/user/user-details");
    serverPublicKey = details.data?.publicKey ?? undefined;
  } catch {}

  if (serverPublicKey && serverPublicKey !== derivedPublicKey) {
    throw new Error(
      "Restored identity key does not match the public key registered on the server.",
    );
  }

  // set up the key pairs in base 64 form on local storage
  await setPrivateKey(privateKeyName, Base64.fromUint8Array(recovered));
  await setPublicKey(publicKeyName, derivedPublicKey);

  // verify that the keys were sucessfully stored on the local device
  const savedPrivateKey = await getPrivateKey(privateKeyName);
  const savedPublicKey = await getPublicKey(publicKeyName);
  if (!savedPublicKey || !savedPrivateKey) {
    throw new Error("Failed to initialize encryption keys");
  }

  // if server doesn't have user's public key then store it
  if (!serverPublicKey) {
    await api.put("/api/user/public-key", { publicKey: savedPublicKey });
  }
  // returns the key pair of the user
  return { publicKey: savedPublicKey, privateKey: savedPrivateKey };
}

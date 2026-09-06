import sodiumModule from "./sodium";
// import sodium from "react-native-libsodium";
import { Base64 } from "js-base64";
import nacl from "tweetnacl";
import { api } from "./api";
import { getCurrentUserId } from "./auth";
import {
  getPrivateKey,
  getPublicKey,
  setPrivateKey,
  setPublicKey,
} from "./secureStorage";
const sodium = (sodiumModule as any).default ?? sodiumModule;

/**
 * Key names in secure storage are scoped to the CURRENT logged-in user so that
 * multiple accounts on one device each keep their own identity keypair. Without
 * this scope, logging into a second account would reuse (and corrupt) the first
 * account's keys. Falls back to the bare name when no user is logged in yet.
 */
async function userKeyName(base: string): Promise<string> {
  const userId = await getCurrentUserId();
  return userId ? `${base}_u${userId}` : base;
}

export async function generateKeyPair() {
  await sodium.ready;
  console.log("sodium keys after ready:", Object.keys(sodium).slice(0, 20));
  console.log("TextEncoder:", typeof TextEncoder);
  console.log("TextDecoder:", typeof TextDecoder);
  if (typeof sodium.crypto_box_keypair !== "function") {
    throw new Error(
      "libsodium crypto_box_keypair is unavailable in this runtime",
    );
  }

  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey, privateKey };
}

/**
 * Returns true when a recovery backup already exists on the server.
 */
export async function hasKeyBackup(): Promise<boolean> {
  try {
    const backup = await api.get("/api/user/key-backup");
    return Boolean(backup?.data?.keyBackupEncrypted);
  } catch {
    return false;
  }
}

/**
 * Parameters describing how the Recovery PIN is turned into an encryption key.
 * All of them are public/non-secret metadata and MUST be stored alongside the
 * encrypted backup so recovery can re-derive the exact same key.
 */
export type KeyBackupParams = {
  keyBackupOpsLimit: number;
  keyBackupMemLimit: number;
  keyBackupAlg: number;
};

export type EnsureKeysResult =
  | { ok: true; brandNew: boolean }
  | { ok: false; reason: "pinNeeded" }
  | { ok: false; reason: "lost" };

/**
 * Ensures a local identity keypair exists — WITHOUT requiring a PIN.
 *
 * - Local keys present    → re-assert the public key, done (brandNew: false).
 * - Recovery backup exists → the PIN is needed to restore the SAME key
 *                            (reinstall / new device).
 * - No local key, no backup, but the server already holds a key for this
 *   account → the key is lost (reinstall without backup). Never mint a
 *   replacement (would orphan history).
 * - No local key, no backup, server has NO key → brand-new account: generate a
 *   fresh keypair locally and report brandNew: true so the UI can invite the
 *   user to set a (skippable) Recovery PIN for this exact key.
 */
export async function ensureLocalKeys(): Promise<EnsureKeysResult> {
  const privateKeyName = await userKeyName("privateKey");
  const publicKeyName = await userKeyName("publicKey");
  const privateKey = await getPrivateKey(privateKeyName);
  const publicKey = await getPublicKey(publicKeyName);

  if (privateKey && publicKey) {
    await api.put("/api/user/public-key", { publicKey }).catch(() => {});
    return { ok: true, brandNew: false };
  }

  if (await hasKeyBackup()) {
    return { ok: false, reason: "pinNeeded" };
  }

  let serverPublicKey: string | undefined;
  try {
    const details = await api.get("/api/user/user-details");
    serverPublicKey = details.data.publicKey ?? undefined;
  } catch {
    // Can't confirm this is a brand-new account — fail closed, don't generate.
    return { ok: false, reason: "lost" };
  }

  if (serverPublicKey) {
    // The server already holds a public key but there's no local key or
    // recovery backup, so its private key is unreachable. NEVER mint a
    // replacement (would orphan every past conversation and weaken E2EE).
    return { ok: false, reason: "lost" };
  }

  const generated = await generateKeyPair();
  await setPublicKey(publicKeyName, Base64.fromUint8Array(generated.publicKey));
  await setPrivateKey(
    privateKeyName,
    Base64.fromUint8Array(generated.privateKey),
  );
  await api
    .put("/api/user/public-key", {
      publicKey: Base64.fromUint8Array(generated.publicKey),
    })
    .catch(() => {});
  return { ok: true, brandNew: true };
}

/**
 * Restores the user's real keys using the recovery PIN. NEVER generates a
 * replacement keypair here — that would orphan every past conversation.
 */
export async function initializeKeys(pin: string) {
  const privateKeyName = await userKeyName("privateKey");
  const publicKeyName = await userKeyName("publicKey");
  let privateKey = await getPrivateKey(privateKeyName);
  let publicKey = await getPublicKey(publicKeyName);

  if (privateKey && publicKey) {
    await api.put("/api/user/public-key", { publicKey });
    return { publicKey, privateKey };
  }

  const recovered = await recoverPrivateKey({ password: pin });
  if (!recovered) {
    throw new Error("Invalid recovery PIN");
  }

  await setPrivateKey(privateKeyName, Base64.fromUint8Array(recovered));
  publicKey = await syncPublicKeyFromPrivateKey(recovered, publicKeyName);
  privateKey = await getPrivateKey(privateKeyName);

  if (!publicKey || !privateKey) {
    throw new Error("Failed to initialize encryption keys");
  }

  await api.put("/api/user/public-key", { publicKey });
  return { publicKey, privateKey };
}

/**
 * Backs up the EXISTING locally-stored private key with a PIN (adding or
 * updating a recovery PIN). Never replaces the identity key.
 */
export async function addRecoveryPin(password: string) {
  const privateKeyName = await userKeyName("privateKey");
  const privateKey = await getPrivateKey(privateKeyName);
  if (!privateKey) {
    throw new Error("No local key found. Please log in first.");
  }
  await backupPrivateKey({
    privateKey: Base64.toUint8Array(privateKey),
    password,
  });
}

export async function derivePublicKeyFromPrivateKey(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  return nacl.box.keyPair.fromSecretKey(privateKey).publicKey;
}

async function syncPublicKeyFromPrivateKey(
  privateKey: Uint8Array,
  publicKeyName?: string,
): Promise<string> {
  const derivedPublicKey = await derivePublicKeyFromPrivateKey(privateKey);
  const base64PublicKey = Base64.fromUint8Array(derivedPublicKey);
  await setPublicKey(
    publicKeyName ?? (await userKeyName("publicKey")),
    base64PublicKey,
  );
  return base64PublicKey;
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
 *
 * NOTE: no longer calls initializeKeys() here — keys must already be set up
 * at login/register. If they're missing, the error below tells you why.
 *
 * Returns:
 *  - a Uint8Array conversation key when it could be fetched AND decrypted
 *  - null when the key exists but THIS device cannot decrypt it (e.g. the
 *    device has not restored its private key yet). Callers must treat null as
 *    "undecryptable on this device" and show a placeholder WITHOUT ever
 *    re-generating the key — re-generating would overwrite the key for every
 *    member and orphan all previously-encrypted history.
 */
export async function getOrCreateConversationKey(
  conversationId: string,
  memberIds: number[],
) {
  // 1. Try to fetch an existing key for this conversation
  const { encryptedConversationKey, nonce, createdById } =
    await getEncryptedConversationKey(conversationId);

  const privateKeyName = await userKeyName("privateKey");
  const receiverPrivateKey = await getPrivateKey(privateKeyName);

  // 2. If it already exists, attempt to decrypt it
  if (encryptedConversationKey && nonce && createdById) {
    if (receiverPrivateKey) {
      try {
        const senderPublicKeyResponse = await api.get(
          `/api/user/${createdById}/public-key`,
        );

        if (senderPublicKeyResponse.data?.publicKey) {
          const { conversationKey } = await decryptConversationKey({
            encryptedConversationKey: Base64.toUint8Array(
              encryptedConversationKey,
            ),
            nonce: Base64.toUint8Array(nonce),
            receiverPrivateKey: Base64.toUint8Array(receiverPrivateKey),
            senderPublicKey: Base64.toUint8Array(
              senderPublicKeyResponse.data.publicKey,
            ),
          });

          return conversationKey;
        }
      } catch {
        console.warn(
          `Could not decrypt existing conversation key for conversation ${conversationId}.`,
        );
      }
    }

    // The key exists but this device can't decrypt it (no private key, or the
    // local keys don't match the conversation's members). NEVER regenerate it
    // here — reassigning the key would orphan every previously-encrypted
    // message for the OTHER members who can still decrypt. Only this device
    // should see a placeholder until it restores its real private key.
    return null;
  }

  // 3. Doesn't exist yet — generate one and distribute it to every member.
  //    Only possible if we actually hold a private key to sign with.
  if (!receiverPrivateKey) {
    return null;
  }

  const conversationKey = await generateConversationKey();

  for (const memberId of memberIds) {
    const publicKeyResponse = await api.get(`/api/user/${memberId}/public-key`);
    if (!publicKeyResponse.data?.publicKey) continue;

    const { encryptedKey, nonce: keyNonce } = await generateEncryptedKey({
      conversationKey,
      receiverPublicKey: Base64.toUint8Array(publicKeyResponse.data.publicKey),
      senderPrivateKey: Base64.toUint8Array(receiverPrivateKey),
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

  const messageBytes = encodeUtf8(message);
  const encryptMessage = sodium.crypto_secretbox_easy(
    messageBytes,
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
  try {
    const encryptedMessageToArray8 = Base64.toUint8Array(encryptedMessage);
    const nonceToArray8 = Base64.toUint8Array(nonce);

    const decryptMessage = sodium.crypto_secretbox_open_easy(
      encryptedMessageToArray8,
      nonceToArray8,
      decryptedConversationKey,
    );

    return { decryptMessage: sodium.to_string(decryptMessage) };
  } catch {
    return { decryptMessage: "[Encrypted Message]" };
  }
}

function encodeUtf8(str: string): Uint8Array {
  if (typeof sodium.from_string === "function") {
    return sodium.from_string(str);
  }
  return new TextEncoder().encode(str);
}

/**
 * Derives an encryption key from the Recovery PIN using Argon2id
 * (`crypto_pwhash`). The salt must be the same random salt that was stored
 * with the backup. The PIN bytes are zeroed as soon as the key is derived so
 * the PIN never lingers in JS memory longer than necessary.
 */
async function deriveKeyFromPin(
  pin: string,
  salt: Uint8Array,
  params: KeyBackupParams,
): Promise<Uint8Array> {
  await sodium.ready;
  const pinBytes = encodeUtf8(pin);
  try {
    return sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      pinBytes,
      salt,
      params.keyBackupOpsLimit,
      params.keyBackupMemLimit,
      params.keyBackupAlg,
    );
  } finally {
    pinBytes.fill(0);
  }
}

function defaultBackupParams(): KeyBackupParams {
  if (typeof sodium.crypto_pwhash !== "function") {
    throw new Error(
      "libsodium crypto_pwhash is unavailable in this runtime. Use the sumo build on web.",
    );
  }
  const argon2id =
    sodium.crypto_pwhash_ALG_ARGON2ID13 ?? sodium.crypto_pwhash_ALG_DEFAULT;
  return {
    keyBackupOpsLimit: sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    keyBackupMemLimit: sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    keyBackupAlg: argon2id,
  };
}

export async function backupPrivateKey({
  privateKey,
  password,
}: {
  privateKey: Uint8Array;
  password: string;
}) {
  await sodium.ready;
  const params = defaultBackupParams();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

  let derivedKey: Uint8Array | undefined;
  try {
    derivedKey = await deriveKeyFromPin(password, salt, params);

    const encryptedPrivateKey = sodium.crypto_secretbox_easy(
      privateKey,
      nonce,
      derivedKey,
    );

    const encryptedPrivateKeyToString =
      Base64.fromUint8Array(encryptedPrivateKey);
    const saltToString = Base64.fromUint8Array(salt);
    const nonceToString = Base64.fromUint8Array(nonce);

    // Only the ENCRYPTED private key + non-secret metadata ever leave this
    // device. The PIN and the plaintext private key stay local and are never
    // sent to the server.
    await api.put("/api/user/key-backup", {
      keyBackupEncrypted: encryptedPrivateKeyToString,
      keyBackupNonce: nonceToString,
      keyBackupSalt: saltToString,
      keyBackupOpsLimit: params.keyBackupOpsLimit,
      keyBackupMemLimit: params.keyBackupMemLimit,
      keyBackupAlg: params.keyBackupAlg,
    });
  } finally {
    derivedKey?.fill(0);
  }
}

export async function recoverPrivateKey({ password }: { password: string }) {
  await sodium.ready;

  let backup;
  try {
    backup = await api.get("/api/user/key-backup");
  } catch {
    return null; // no backup exists
  }

  if (!backup?.data?.keyBackupEncrypted) {
    return null;
  }

  // KDF/encryption parameters were stored with the backup. Fall back to the
  // defaults when restoring a legacy backup that predates storing them, so
  // old backups remain recoverable.
  const legacy = defaultBackupParams();
  const params: KeyBackupParams = {
    keyBackupOpsLimit:
      typeof backup.data.keyBackupOpsLimit === "number"
        ? backup.data.keyBackupOpsLimit
        : legacy.keyBackupOpsLimit,
    keyBackupMemLimit:
      typeof backup.data.keyBackupMemLimit === "number"
        ? backup.data.keyBackupMemLimit
        : legacy.keyBackupMemLimit,
    keyBackupAlg:
      typeof backup.data.keyBackupAlg === "number"
        ? backup.data.keyBackupAlg
        : legacy.keyBackupAlg,
  };

  // Refuse to attempt a key derivation with invalid stored parameters.
  if (
    !params.keyBackupOpsLimit ||
    !params.keyBackupMemLimit ||
    !params.keyBackupAlg
  ) {
    return null;
  }

  const encryptedPrivateKeyToArray8 = Base64.toUint8Array(
    backup.data.keyBackupEncrypted,
  );
  const nonceToArray8 = Base64.toUint8Array(backup.data.keyBackupNonce);
  const saltToArray8 = Base64.toUint8Array(backup.data.keyBackupSalt);

  let derivedKey: Uint8Array | undefined;
  try {
    derivedKey = await deriveKeyFromPin(password, saltToArray8, params);

    return sodium.crypto_secretbox_open_easy(
      encryptedPrivateKeyToArray8,
      nonceToArray8,
      derivedKey,
    );
  } catch {
    return null; // wrong pin
  } finally {
    derivedKey?.fill(0);
  }
}

export async function shareConversationKeyWithMembers({
  conversationId,
  memberIds,
}: {
  conversationId: string;
  memberIds: number[];
}) {
  const conversationKey = await getOrCreateConversationKey(
    conversationId,
    memberIds,
  );
  if (!conversationKey) return false; // device can't decrypt

  const privateKeyName = await userKeyName("privateKey");
  const receiverPrivateKey = await getPrivateKey(privateKeyName);
  if (!receiverPrivateKey) return false;

  for (const memberId of memberIds) {
    const { data } = await api.get(`/api/user/${memberId}/public-key`);
    if (!data?.publicKey) continue;

    const { encryptedKey, nonce: keyNonce } = await generateEncryptedKey({
      conversationKey,
      receiverPublicKey: Base64.toUint8Array(data.publicKey),
      senderPrivateKey: Base64.toUint8Array(receiverPrivateKey),
    });
    await api.put(`/api/conversations/${conversationId}/key/${memberId}`, {
      encryptedKey: Base64.fromUint8Array(encryptedKey),
      nonce: Base64.fromUint8Array(keyNonce),
    });
  }
  return true;
}

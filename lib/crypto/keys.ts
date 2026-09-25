import sodiumModule from "./sodium";
import { Base64 } from "js-base64";
import nacl from "tweetnacl";
import { api } from "@/lib/api";
import {
  getCurrentUserId,
  getPrivateKey,
  getPublicKey,
  setPrivateKey,
  setPublicKey,
} from "@/lib/auth";
import { getConversationKeyCache, setConversationKeyCache } from "@/lib/db";
import { recoverPrivateKey } from "./recovery";
const sodium = (sodiumModule as any).default ?? sodiumModule;

// In-memory conversation key cache so re-opening a chat is instant (no
// network round-trip to fetch/decrypt the key again). Persisted to SQLite as
// a fast fallback on next launch.
const conversationKeyCache = new Map<string, Uint8Array>();

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
  let privateKey = await getPrivateKey(privateKeyName);
  let publicKey = await getPublicKey(publicKeyName);

  if (privateKey && !publicKey) {
    try {
      publicKey = await syncPublicKeyFromPrivateKey(
        Base64.toUint8Array(privateKey),
        publicKeyName,
      );
    } catch {}
  }

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

  if (privateKey && !publicKey) {
    try {
      publicKey = await syncPublicKeyFromPrivateKey(
        Base64.toUint8Array(privateKey),
        publicKeyName,
      );
    } catch {}
  }

  if (privateKey && publicKey) {
    return { publicKey, privateKey };
  }

  const recovered = await recoverPrivateKey({ password: pin });
  if (!recovered) {
    throw new Error("Invalid recovery PIN");
  }

  const derivedPublicKeyBytes = await derivePublicKeyFromPrivateKey(recovered);
  const derivedPublicKey = Base64.fromUint8Array(derivedPublicKeyBytes);

  let serverPublicKey: string | undefined;
  try {
    const details = await api.get("/api/user/user-details");
    serverPublicKey = details.data?.publicKey ?? undefined;
  } catch {
    // network check optional
  }

  if (serverPublicKey && serverPublicKey !== derivedPublicKey) {
    throw new Error(
      "Restored identity key does not match the public key registered on the server.",
    );
  }

  await setPrivateKey(privateKeyName, Base64.fromUint8Array(recovered));
  await setPublicKey(publicKeyName, derivedPublicKey);
  privateKey = await getPrivateKey(privateKeyName);
  publicKey = await getPublicKey(publicKeyName);

  if (!publicKey || !privateKey) {
    throw new Error("Failed to initialize encryption keys");
  }

  if (!serverPublicKey) {
    await api.put("/api/user/public-key", { publicKey });
  }
  return { publicKey, privateKey };
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
    // The member who actually generated/sealed the conversation key. Not the
    // same as createdById when a non-creator opened the chat first. All copies
    // are sealed with THIS member's private key, so every device must open its
    // copy using this member's public key.
    keyCreatedById: response.data.keyCreatedById ?? null,
    senderUserId:
      response.data.senderUserId ?? response.data.createdById ?? null,
  };
}

/**
 * First device to open a conversation claims the right to generate its key.
 * The server returns 409 with `claimed: false` if another device won.
 */
export async function claimConversationKey(conversationId: string) {
  const response = await api.post(`/api/conversations/${conversationId}/key`);
  return {
    claimed: Boolean(response.data?.claimed),
    keyCreatedById: response.data?.keyCreatedById ?? null,
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
  // 0. Instant fast path — key already decrypted in this session.
  const cached = conversationKeyCache.get(conversationId);
  if (cached) return cached;

  // 0b. Quick fallback — key decrypted on a previous session.
  const persisted = await getConversationKeyCache(Number(conversationId));
  if (persisted) {
    try {
      const key = Base64.toUint8Array(persisted);
      conversationKeyCache.set(conversationId, key);
      return key;
    } catch {
      // corrupt cache row — ignore
    }
  }

  const privateKeyName = await userKeyName("privateKey");
  const receiverPrivateKey = await getPrivateKey(privateKeyName);
  if (!receiverPrivateKey) {
    // No private key on this device — can never decrypt messages.
    return null;
  }

  // 1. Try to decrypt an existing key for this conversation.
  const row = await getEncryptedConversationKey(conversationId);
  if (row?.encryptedConversationKey && row?.nonce) {
    return await openConversationKey({
      conversationId,
      row,
      receiverPrivateKey,
    });
  }

  // 2. No usable key yet — claim the right to generate one.
  let claimed = false;
  try {
    const result = await claimConversationKey(conversationId);
    claimed = result.claimed;
  } catch (err: any) {
    // 409 = another device generated (or is generating) the key.
    if (err?.response?.status !== 409) {
      console.warn("Failed to claim conversation key:", err);
      return null;
    }
  }

  // 3. Someone else won the race — fetch their key and open our copy.
  if (!claimed) {
    const winnerRow = await getEncryptedConversationKey(conversationId);
    if (winnerRow?.encryptedConversationKey && winnerRow?.nonce) {
      return await openConversationKey({
        conversationId,
        row: winnerRow,
        receiverPrivateKey,
      });
    }
    return null;
  }

  // 4. We won — generate the conversation key and seal a copy for every
  //    member using OUR private key (the server records us as keyCreatedById).
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

  conversationKeyCache.set(conversationId, conversationKey);
  setConversationKeyCache(
    Number(conversationId),
    Base64.fromUint8Array(conversationKey),
  ).catch(() => {});

  return conversationKey;
}

/**
 * Tries to open this device's per-member copy of the conversation key using
 * the public key of the member who actually generated/sealed it
 * (`senderUserId`). Returns null when the copy can't be opened — messages must
 * then render as "[Encrypted Message]" and the key must NEVER be regenerated
 * here (that would orphan history for every other member).
 */
async function openConversationKey({
  conversationId,
  row,
  receiverPrivateKey,
}: {
  conversationId: string;
  row: {
    encryptedConversationKey: string;
    nonce: string;
    senderUserId: number | null;
    createdById: number | null;
  };
  receiverPrivateKey: string;
}): Promise<Uint8Array | null> {
  const senderUserId = row.senderUserId ?? row.createdById;
  if (!senderUserId) {
    console.warn(
      `Conversation ${conversationId} has a key but no known sender.`,
    );
    return null;
  }

  try {
    const senderPublicKeyResponse = await api.get(
      `/api/user/${senderUserId}/public-key`,
    );
    if (!senderPublicKeyResponse.data?.publicKey) return null;

    const { conversationKey } = await decryptConversationKey({
      encryptedConversationKey: Base64.toUint8Array(
        row.encryptedConversationKey,
      ),
      nonce: Base64.toUint8Array(row.nonce),
      receiverPrivateKey: Base64.toUint8Array(receiverPrivateKey),
      senderPublicKey: Base64.toUint8Array(
        senderPublicKeyResponse.data.publicKey,
      ),
    });

    conversationKeyCache.set(conversationId, conversationKey);
    setConversationKeyCache(
      Number(conversationId),
      Base64.fromUint8Array(conversationKey),
    ).catch(() => {});
    return conversationKey;
  } catch {
    console.warn(
      `Could not decrypt existing conversation key for conversation ${conversationId}.`,
    );
    return null;
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

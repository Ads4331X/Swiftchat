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
    throw new Error(
      "libsodium crypto_box_keypair is unavailable in this runtime",
    );
  }

  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  return { publicKey, privateKey };
}

/**
 * Returns true when a recovery backup already exists on the server. Callers
 * use this to decide whether a needed PIN is "enter" (recover existing) or
 * "create" (brand-new user with no history to restore).
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
 * Ensures a local keypair exists, using the PIN to recover the user's real
 * keys when a backup exists (reinstall/new device).
 *
 * - Local keys present          → return them (normal path).
 * - Backup exists               → recover with the PIN; WRONG PIN throws (never
 *                                 generate a fresh keypair and orphan history).
 * - No backup at all (new user) → generate + back up with the PIN.
 *
 * A PIN is required when no local keys exist. Callers must prompt for one.
 */
export async function initializeKeys(pin: string) {
  let privateKey = await getPrivateKey("privateKey");
  let publicKey = await getPublicKey("publicKey");

  // Self-heal installs damaged by an older bug that generated a fresh keypair
  // and overwrote the account's public key. If the locally-stored pair is
  // inconsistent with the account's real key on the server, discard it so we
  // re-recover the genuine keys from the backup below.
  if (privateKey && publicKey) {
    try {
      const localDerived = Base64.fromUint8Array(
        await derivePublicKeyFromPrivateKey(Base64.toUint8Array(privateKey)),
      );
      const server = await api.get("/api/user/user-details");
      const serverPublicKey: string | undefined = server.data.publicKey;
      if (localDerived !== publicKey || (serverPublicKey && localDerived !== serverPublicKey)) {
        privateKey = null;
        publicKey = null;
      }
    } catch {
      // If we can't verify, keep the current keys rather than risk locks.
    }
  }

  if (!privateKey || !publicKey) {
    const hasBackup = await hasKeyBackup();

    if (hasBackup) {
      // Existing backup — must recover with the exact PIN. Never fall back
      // to a fresh keypair here: that would orphan every past conversation.
      const recovered = await recoverPrivateKey({ password: pin });
      if (!recovered) {
        throw new Error("Invalid recovery PIN");
      }

      const base64PrivateKey = Base64.fromUint8Array(recovered);
      await setPrivateKey("privateKey", base64PrivateKey);

      // Derive the public key from the recovered private key. This is
      // cryptographically guaranteed to be the exact public key that paired
      // with this private key, so it self-heals a server public key that was
      // previously corrupted by a broken reinstall.
      publicKey = await syncPublicKeyFromPrivateKey(recovered);

      privateKey = await getPrivateKey("privateKey");
    } else {
      // No backup — brand new account, generate and back up with the PIN.
      const generated = await generateKeyPair();
      const base64PublicKey = Base64.fromUint8Array(generated.publicKey);
      const base64PrivateKey = Base64.fromUint8Array(generated.privateKey);

      await setPublicKey("publicKey", base64PublicKey);
      await setPrivateKey("privateKey", base64PrivateKey);

      await backupPrivateKey({
        privateKey: generated.privateKey,
        password: pin,
      });

      publicKey = await getPublicKey("publicKey");
      privateKey = await getPrivateKey("privateKey");
    }
  }

  if (!publicKey || !privateKey) {
    throw new Error("Failed to initialize encryption keys");
  }

  await api.put("/api/user/public-key", { publicKey });
  return { publicKey, privateKey };
}

export async function derivePublicKeyFromPrivateKey(
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.crypto_scalarmult_base(privateKey);
}

async function syncPublicKeyFromPrivateKey(
  privateKey: Uint8Array,
): Promise<string> {
  const derivedPublicKey = await derivePublicKeyFromPrivateKey(privateKey);
  const base64PublicKey = Base64.fromUint8Array(derivedPublicKey);
  await setPublicKey("publicKey", base64PublicKey);
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
 */
export async function getOrCreateConversationKey(
  conversationId: string,
  memberIds: number[],
) {
  // 1. Try to fetch an existing key for this conversation
  const { encryptedConversationKey, nonce, createdById } =
    await getEncryptedConversationKey(conversationId);

  // 2. If it already exists, attempt to decrypt it
  if (encryptedConversationKey && nonce && createdById) {
    const receiverPrivateKey = await getPrivateKey("privateKey");
    if (receiverPrivateKey) {
      try {
        const senderPublicKeyResponse = await api.get(
          `/api/user/${createdById}/public-key`,
        );

        if (senderPublicKeyResponse.data?.publicKey) {
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
      } catch {
        console.warn(
          `Could not decrypt existing conversation key for conversation ${conversationId}. Re-generating key...`,
        );
      }
    }
  }

  // 3. Doesn't exist yet — generate one and distribute it to every member
  const conversationKey = await generateConversationKey();

  for (const memberId of memberIds) {
    const publicKeyResponse = await api.get(`/api/user/${memberId}/public-key`);
    const senderPrivateKey = await getPrivateKey("privateKey");
    if (!senderPrivateKey) {
      throw new Error(
        "Private key not found — call initializeKeys() at login first",
      );
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
  try {
    const encryptedMessageToArray8 = Base64.toUint8Array(encryptedMessage);
    const nonceToArray8 = Base64.toUint8Array(nonce);

    const decryptMessage = sodium.crypto_secretbox_open_easy(
      encryptedMessageToArray8,
      nonceToArray8,
      decryptedConversationKey,
    );

    return { decryptMessage: new TextDecoder().decode(decryptMessage) };
  } catch {
    return { decryptMessage: "[Encrypted Message]" };
  }
}

export async function backupPrivateKey({
  privateKey,
  password,
}: {
  privateKey: Uint8Array;
  password: string;
}) {
  await sodium.ready;
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

  const derivedKey = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT,
  );

  const encryptedPrivateKey = sodium.crypto_secretbox_easy(
    privateKey,
    nonce,
    derivedKey,
  );

  const encryptedPrivateKeyToString =
    Base64.fromUint8Array(encryptedPrivateKey);
  const saltToString = Base64.fromUint8Array(salt);
  const nonceToString = Base64.fromUint8Array(nonce);

  await api.put("/api/user/key-backup", {
    keyBackupEncrypted: encryptedPrivateKeyToString,
    keyBackupNonce: nonceToString,
    keyBackupSalt: saltToString,
  });
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

  const encryptedPrivateKeyToArray8 = Base64.toUint8Array(
    backup.data.keyBackupEncrypted,
  );
  const nonceToArray8 = Base64.toUint8Array(backup.data.keyBackupNonce);
  const saltToArray8 = Base64.toUint8Array(backup.data.keyBackupSalt);

  const derivedKey = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    saltToArray8,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT,
  );

  try {
    const decryptedPrivateKey = sodium.crypto_secretbox_open_easy(
      encryptedPrivateKeyToArray8,
      nonceToArray8,
      derivedKey,
    );
    return decryptedPrivateKey;
  } catch {
    return null; // wrong pin
  }
}

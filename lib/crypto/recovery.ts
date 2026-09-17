import sodiumModule from "./sodium";
import { Base64 } from "js-base64";
import { api } from "@/lib/api";
import { getCurrentUserId, getPrivateKey } from "@/lib/auth";
import { encodeUtf8 } from "./encryption";
const sodium = (sodiumModule as any).default ?? sodiumModule;

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

/**
 * Backs up the EXISTING locally-stored private key with a PIN (adding or
 * updating a recovery PIN). Never replaces the identity key.
 */
export async function addRecoveryPin(password: string) {
  const userId = await getCurrentUserId();
  const privateKeyName = userId ? `privateKey_u${userId}` : "privateKey";
  const privateKey = await getPrivateKey(privateKeyName);
  if (!privateKey) {
    throw new Error("No local key found. Please log in first.");
  }
  await backupPrivateKey({
    privateKey: Base64.toUint8Array(privateKey),
    password,
  });
}
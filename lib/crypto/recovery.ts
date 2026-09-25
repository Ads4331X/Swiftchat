import sodiumModule from "./sodium";
import { Base64 } from "js-base64";
import { api } from "@/lib/api";
import { getCurrentUserId, getPrivateKey } from "@/lib/auth";
import { encodeUtf8 } from "./encryption";
const sodium = (sodiumModule as any).default ?? sodiumModule;

export type KeyBackupParams = {
  keyBackupOpsLimit: number;
  keyBackupMemLimit: number;
  keyBackupAlg: number;
};

async function deriveKeyFromPin(
  pin: string,
  salt: Uint8Array,
  params: KeyBackupParams,
): Promise<Uint8Array> {
  await sodium.ready;
  // converts the PIN into bytes
  const pinBytes = encodeUtf8(pin);

  try {
    // creates a backup encryption key from the PIN
    return sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      pinBytes,
      salt,
      params.keyBackupOpsLimit,
      params.keyBackupMemLimit,
      params.keyBackupAlg,
    );
  } finally {
    // clears the PIN bytes from memory
    pinBytes.fill(0);
  }
}

// gets the default backup settings
function defaultBackupParams(): KeyBackupParams {
  if (typeof sodium.crypto_pwhash !== "function") {
    throw new Error(
      "libsodium crypto_pwhash is unavailable in this runtime. Use the sumo build on web.",
    );
  }
  // uses Argon2id if available otherwise uses libsodium's default algorithm
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
  // gets the default backup settings
  const params = defaultBackupParams();
  // generates a random nonce and salt
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);

  let derivedKey: Uint8Array | undefined;
  try {
    // creates a backup encryption key from the PIN
    derivedKey = await deriveKeyFromPin(password, salt, params);

    // encrypts the private key using the nonce and derived key
    const encryptedPrivateKey = sodium.crypto_secretbox_easy(
      privateKey,
      nonce,
      derivedKey,
    );

    // converts the encrypted private key, salt and nonce to Base64
    const encryptedPrivateKeyToString =
      Base64.fromUint8Array(encryptedPrivateKey);
    const saltToString = Base64.fromUint8Array(salt);
    const nonceToString = Base64.fromUint8Array(nonce);

    // sends the encrypted private key and backup settings to the server
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
    // fetches the key backup from the server
    backup = await api.get("/api/user/key-backup");
  } catch {
    return null;
  }
  // no backup exists
  if (!backup?.data?.keyBackupEncrypted) {
    return null;
  }

  // gets the default backup settings
  const legacy = defaultBackupParams();
  // uses the stored settings if available, otherwise uses the defaults
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

  // converts the encrypted private key, nonce and salt to Uint8Array
  const encryptedPrivateKeyToArray8 = Base64.toUint8Array(
    backup.data.keyBackupEncrypted,
  );
  const nonceToArray8 = Base64.toUint8Array(backup.data.keyBackupNonce);
  const saltToArray8 = Base64.toUint8Array(backup.data.keyBackupSalt);

  let derivedKey: Uint8Array | undefined;
  try {
    // creates the backup key from the PIN
    derivedKey = await deriveKeyFromPin(password, saltToArray8, params);
    // decrypts the private key using the backup key
    return sodium.crypto_secretbox_open_easy(
      encryptedPrivateKeyToArray8,
      nonceToArray8,
      derivedKey,
    );
  } catch {
    return null; // decryption failed
  } finally {
    derivedKey?.fill(0);
  }
}

export async function addRecoveryPin(password: string) {
  const userId = await getCurrentUserId(); // gets the user ID

  const privateKeyName = userId
    ? `privateKey_u${userId}`
    : "privateKey"; // gets the private key name

  const privateKey = await getPrivateKey(privateKeyName); // gets the private key from local storage
  if (!privateKey) {
    throw new Error("No local key found. Please log in first.");
  }
  // backs up the private key
  await backupPrivateKey({
    privateKey: Base64.toUint8Array(privateKey), // converts the Base64 private key to Uint8Array
    password,
  });
}

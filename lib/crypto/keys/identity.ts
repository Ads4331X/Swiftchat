import sodiumModule from "../sodium";
import { Base64 } from "js-base64";
import { api } from "@/lib/api";
import {
  getPrivateKey,
  getPublicKey,
  removePrivateKey,
  removePublicKey,
  setPrivateKey,
  setPublicKey,
} from "@/lib/auth";
import { recoverPrivateKey } from "../recovery";
import { getIdentityKeyNames } from "./identityStorage";
import { derivePublicKeyFromPrivateKey } from "./derivePublicKey";
import { withIdentityLock } from "./identityLock";

export { derivePublicKeyFromPrivateKey };

const sodium = (sodiumModule as any).default ?? sodiumModule;

export type EnsureKeysResult =
  | { ok: true; brandNew: boolean }
  | { ok: false; reason: "pinNeeded" }
  | { ok: false; reason: "lost" }
  | { ok: false; reason: "conflict"; message: string };

export type KeyBackupStatus = "present" | "absent" | "error";

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

/*
 * Distinguishes "the server has no backup" from "we could not tell". Treating
 * a failed lookup as "no backup" is dangerous: it can lead to minting a brand
 * new identity while the account still has a recoverable one.
 */
export async function getKeyBackupStatus(): Promise<KeyBackupStatus> {
  try {
    const backup = await api.get("/api/user/key-backup");
    return backup?.data?.keyBackupEncrypted ? "present" : "absent";
  } catch (err: any) {
    // A 404 means the endpoint authoritatively reported "no key backup found".
    // Anything else (network error, 5xx) means the state is unknown.
    if (err?.response?.status === 404) return "absent";
    return "error";
  }
}

// look up if server has the user's private key as backup ( encrypted private key)
export async function hasKeyBackup(): Promise<boolean> {
  return (await getKeyBackupStatus()) === "present";
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
  // Serialize the whole read-decide-write sequence so concurrent tabs/screens
  // cannot mint different keypairs for the same account.
  return withIdentityLock(async () => {
    // loads the key pair of user stored on the device locally
    const { privateKeyName, publicKeyName, privateKey, publicKey } =
      await loadLocalIdentityKeys();

    // An identity already exists on this device. Make sure the server has the
    // SAME public key — but never overwrite a different registered key, which
    // would orphan every conversation key sealed to it.
    if (privateKey && publicKey) {
      let serverPublicKey: string | undefined;
      try {
        const details = await api.get("/api/user/user-details");
        serverPublicKey = details.data?.publicKey ?? undefined;
      } catch {
        return {
          ok: false,
          reason: "conflict",
          message: "Could not verify your encryption key with the server.",
        };
      }

      if (!serverPublicKey) {
        // The server has no key yet (e.g. it was cleared). Register the local one.
        try {
          await api.put("/api/user/public-key", { publicKey });
        } catch {
          return {
            ok: false,
            reason: "conflict",
            message: "Could not register your encryption key with the server.",
          };
        }
      } else if (serverPublicKey !== publicKey) {
        // Local identity and the registered identity disagree. Stop rather
        // than overwriting either side.
        return {
          ok: false,
          reason: "conflict",
          message:
            "This device's encryption key does not match the key registered on the server.",
        };
      }

      return { ok: true, brandNew: false }; // no new key was generated and setup of keys completed successfully
    }

    // check if server has the users private key backup (encrypted ver)
    const backupStatus = await getKeyBackupStatus();
    if (backupStatus === "present") {
      return { ok: false, reason: "pinNeeded" }; // to decrypt the message pin is needed and stop the key setup
    }
    if (backupStatus === "error") {
      // Unknown whether a recoverable identity exists — do NOT generate a new
      // keypair, which could permanently orphan the account's messages.
      return {
        ok: false,
        reason: "conflict",
        message: "Could not check for an existing encryption backup.",
      };
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
    try {
      await api.put("/api/user/public-key", { publicKey: publicKeyBase64 });
    } catch {
      // Registration failed. Roll back the freshly generated local identity so
      // a later attempt (or another tab) cannot adopt a key the server does not
      // know about, and report the failure instead of swallowing it.
      await removePublicKey(publicKeyName).catch(() => {});
      await removePrivateKey(privateKeyName).catch(() => {});
      return {
        ok: false,
        reason: "conflict",
        message: "Could not register your new encryption key with the server.",
      };
    }

    return { ok: true, brandNew: true };
  });
}

export async function initializeKeys(pin: string) {
  // Serialize with ensureLocalKeys/addRecoveryPin so recovery, generation and
  // backup updates cannot interleave.
  return withIdentityLock(async () => {
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
    } catch {
      // Do not proceed with an unverified identity — the server may already
      // have a different key registered.
      throw new Error(
        "Could not verify your encryption key with the server. Please try again.",
      );
    }

    // A successful decrypt only proves the PIN matches THIS backup, not that
    // the backup belongs to the identity currently registered on the server.
    // Never overwrite the registered key or the backup on a mismatch.
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
  });
}

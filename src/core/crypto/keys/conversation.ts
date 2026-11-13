import sodiumModule from "@/core/crypto/sodium";
import { Base64 } from "js-base64";
import { api, getUserPublicKey } from "@/core/api";
import { decryptMessage } from "@/core/crypto/encryption";
import { getConversationKeyCache, setConversationKeyCache } from "@/core/db";
import { getCurrentUserPrivateKey } from "@/core/crypto/keys/identityStorage";
import type { Message } from "@/types/message";

const sodium = (sodiumModule as any).default ?? sodiumModule;
// creating a temp cache while the conversation is open
const conversationKeyCache = new Map<string, Uint8Array>();
<<<<<<< Updated upstream
=======
const conversationKeyRequests = new Map<
  string,
  Promise<Uint8Array | null>
>();
const conversationEpochCache = new Map<string, number>();
>>>>>>> Stashed changes

type EncryptedConversationKeyRow = {
  encryptedConversationKey: string;
  nonce: string;
  createdById: number | null;
  senderUserId: number | null;
};

async function getCachedConversationKey(
  conversationId: string,
): Promise<Uint8Array | null> {
  // gets the cached converastion key and returns if it exists
  const cached = conversationKeyCache.get(conversationId);
  if (cached) return cached;

  // get the conversationkey cache from the local db
  const persisted = await getConversationKeyCache(Number(conversationId));
  if (!persisted) return null;

  try {
    // setup the conversation key cache a
    const key = Base64.toUint8Array(persisted);
    conversationKeyCache.set(conversationId, key);
    return key;
  } catch {
    return null;
  }
}

/**
 * Synchronous read of the in-session key cache. On web the SQLite cache can be
 * unavailable (`getDb()` returns null), so attachment encryption/decryption
 * must be able to fall back to the key cached in memory this session.
 */
export function getInMemoryConversationKey(
  conversationId: number,
): Uint8Array | null {
<<<<<<< Updated upstream
  return conversationKeyCache.get(String(conversationId)) ?? null;
=======
  return conversationKeyCache.get(`${conversationId}:${epoch}`) ?? null;
}

/**
 * Resolves the key for a specific historical epoch without changing the
 * conversation's cached current epoch. Used to decrypt each message with the
 * key it was actually encrypted under.
 */
export async function getConversationKeyForEpoch(
  conversationId: number | string,
  epoch: number,
): Promise<Uint8Array | null> {
  const id = String(conversationId);
  const cacheId = `${id}:${epoch}`;
  const cached = conversationKeyCache.get(cacheId);
  if (cached) return cached;

  const persisted = await getConversationKeyCache(Number(id), epoch);
  if (!persisted) return null;

  try {
    const key = Base64.toUint8Array(persisted);
    conversationKeyCache.set(cacheId, key);
    return key;
  } catch {
    return null;
  }
}

/**
 * Resolves the conversation's current key epoch. Uses the epoch cached while
 * loading the conversation key, then falls back to the server.
 */
export async function getConversationEpoch(
  conversationId: number | string,
): Promise<number> {
  const key = String(conversationId);
  const cached = conversationEpochCache.get(key);
  if (cached != null) return cached;

  try {
    const row = await getEncryptedConversationKey(key);
    if (row?.epoch) {
      conversationEpochCache.set(key, row.epoch);
      return row.epoch;
    }
  } catch {
    // no key package yet — fall back to the default epoch
  }

  return 1;
}

/**
 * Fetches the server's current key package and resolves its conversation key,
 * bypassing the cached epoch so a rejected old epoch can be refreshed.
 */
export async function getCurrentConversationKey(
  conversationId: number | string,
): Promise<{ conversationKey: Uint8Array; epoch: number } | null> {
  const id = String(conversationId);
  const row = await getEncryptedConversationKey(id);
  if (!row?.encryptedConversationKey || !row?.nonce) return null;

  const cached = await getCachedConversationKey(id, row.epoch);
  if (cached) {
    conversationEpochCache.set(id, row.epoch);
    return { conversationKey: cached, epoch: row.epoch };
  }

  const currentUserPrivateKey = await getCurrentUserPrivateKey();
  if (!currentUserPrivateKey) return null;

  const conversationKey = await openConversationKey({
    conversationId: id,
    row,
    receiverPrivateKey: currentUserPrivateKey,
  });
  if (!conversationKey) return null;

  conversationEpochCache.set(id, row.epoch);
  return { conversationKey, epoch: row.epoch };
>>>>>>> Stashed changes
}

function cacheConversationKey(
  conversationId: string,
  conversationKey: Uint8Array,
): void {
  // set the conversation key (encrypted) as cache and also store locally
  conversationKeyCache.set(conversationId, conversationKey);
  setConversationKeyCache(
    Number(conversationId),
    Base64.fromUint8Array(conversationKey),
  ).catch(() => {});
}

// creates 32 randopm bytes and returns in unit8array
export async function generateConversationKey() {
  await sodium.ready;
  return sodium.randombytes_buf(32);
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
  // creates a nonce of random bytes from crypto_box_NONCEBYTES (usually 32)
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  // encryptes the conversation key
  const encryptedKey = sodium.crypto_box_easy(
    conversationKey,
    nonce,
    receiverPublicKey,
    senderPrivateKey,
  );

  return { encryptedKey, nonce }; // returns the  encrypted conversation key and the nonce
}

export async function getEncryptedConversationKey(conversationId: string) {
  // fetches the encrypted conversation key from the server
  const response = await api.get(`/api/conversations/${conversationId}/key`);
  return {
    encryptedConversationKey: response.data.encryptedConversationKey,
    nonce: response.data.nonce,
    createdById: response.data.createdById, // user who created the conversation
    keyCreatedById: response.data.keyCreatedById ?? null, // user who created the encryption key
    senderUserId:
      response.data.senderUserId ?? response.data.createdById ?? null, // user who sent the encrypted key
  };
}
export async function claimConversationKey(conversationId: string) {
  // asks the server if this user can create the conversation key
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
  // decrypt the conversation key ( encrypted)
  const conversationKey = sodium.crypto_box_open_easy(
    encryptedConversationKey,
    nonce,
    senderPublicKey,
    receiverPrivateKey,
  );

  return { conversationKey }; // returns the decrypted conversaiton key for decrypting the messages
}

// takes the encrypted conversation key and decrypts the key using the user's own private key
async function openConversationKey({
  conversationId,
  row,
  receiverPrivateKey,
}: {
  conversationId: string;
  row: EncryptedConversationKeyRow;
  receiverPrivateKey: string;
}): Promise<Uint8Array | null> {
  const senderUserId = row.senderUserId ?? row.createdById; // gets the user's id who encrypted the conversation key
  if (!senderUserId) {
    console.warn(
      `Conversation ${conversationId} has a key but no known sender.`,
    );
    return null;
  }

  try {
    // fetch the public user's public key form the server
    const { data } = await api.get(`/api/user/${senderUserId}/public-key`);
    if (!data?.publicKey) return null; // returns null if public key is nnot found in the server

    // decrypts the conversation key
    const { conversationKey } = await decryptConversationKey({
      encryptedConversationKey: Base64.toUint8Array(
        // converts the base 64 encrypted converastion key to unit8array
        row.encryptedConversationKey, // encrypted conversation key
      ),
      nonce: Base64.toUint8Array(row.nonce), // converts the base64 nonce to unit8array
      receiverPrivateKey: Base64.toUint8Array(receiverPrivateKey), // converts the base64 receiver private key to unit8array
      senderPublicKey: Base64.toUint8Array(data.publicKey), // converts the sender's public key to unit8array
    });

    cacheConversationKey(conversationId, conversationKey); // stores the decrypted conversation key in the cache
    return conversationKey; // returns the decrypted conversation key
  } catch {
    console.warn(
      `Could not decrypt existing conversation key for conversation ${conversationId}.`,
    );
    return null;
  }
}

// stores conversation key for group members
async function storeEncryptedConversationKeysForMembers({
  conversationId,
  memberIds,
  conversationKey,
  currentUserPrivateKey,
}: {
  conversationId: string;
  memberIds: number[];
  conversationKey: Uint8Array;
  currentUserPrivateKey: string;
}): Promise<void> {
  const senderPrivateKey = Base64.toUint8Array(currentUserPrivateKey); // convert your( user's) encoded base 64 private key to unit8array

  for (const memberId of memberIds) {
    // fetch each member public key
    const { data } = await api.get(`/api/user/${memberId}/public-key`);
    if (!data?.publicKey) continue;
    // generates encrypted conversation key for each member using their public key and creator ( group admin) private key
    const { encryptedKey, nonce } = await generateEncryptedKey({
      conversationKey,
      receiverPublicKey: Base64.toUint8Array(data.publicKey), // converts member public key tpo unit8array
      senderPrivateKey,
    });

    // store the group members encrypted key and nonce as base 64
    await api.put(`/api/conversations/${conversationId}/key/${memberId}`, {
      encryptedKey: Base64.fromUint8Array(encryptedKey),
      nonce: Base64.fromUint8Array(nonce),
    });
  }
}

/**
 *
 * @param conversationId
 * @param memberIds
 * @returns conversationKey ( decrypted )
 *  flow of this function
1. Check cache
2. Get current user's private key
3. Fetch encrypted key from server
4. If key exists → decrypt it
5. If not → ask server if this user can create it
6. If not allowed → fetch the key someone else created
7. If allowed → generate a new conversation key
8. Encrypt it for each member and store it
9. Cache the actual conversation key
10. Return the actual conversation key
 */
export async function getOrCreateConversationKey(
  conversationId: string,
  memberIds: number[],
) {
<<<<<<< Updated upstream
  const cached = await getCachedConversationKey(conversationId); // gets the conversaion key from the cache
  if (cached) return cached;

=======
  const pending = conversationKeyRequests.get(conversationId);
  if (pending) return pending;

  const request = createConversationKey(conversationId, memberIds).finally(
    () => {
      if (conversationKeyRequests.get(conversationId) === request) {
        conversationKeyRequests.delete(conversationId);
      }
    },
  );

  conversationKeyRequests.set(conversationId, request);
  return request;
}

async function createConversationKey(
  conversationId: string,
  memberIds: number[],
) {
>>>>>>> Stashed changes
  // gets the users private key
  const currentUserPrivateKey = await getCurrentUserPrivateKey();
  if (!currentUserPrivateKey) return null;

  // gets the encrypted conversation key as base64
  const row = await getEncryptedConversationKey(conversationId);
  // if encrypted conversation key and nonce exist then open the conversation
  //( decrypt the conversation using user's private key and encrypted conversation key)
  if (row?.encryptedConversationKey && row?.nonce) {
<<<<<<< Updated upstream
=======
    const cached = await getCachedConversationKey(conversationId, row.epoch);
    if (cached) {
      conversationEpochCache.set(conversationId, row.epoch);
      return cached;
    }

>>>>>>> Stashed changes
    return openConversationKey({
      conversationId,
      row,
      receiverPrivateKey: currentUserPrivateKey,
    });
  }

  let claimed = false;
  try {
    // asks the server if this user can create the conversation key
    const result = await claimConversationKey(conversationId);
    claimed = result.claimed;
  } catch (error: any) {
    if (error?.response?.status !== 409) {
      console.warn("Failed to claim conversation key:", error);
      return null;
    }
  }

  // if this user did not create the key, fetch it from the server
  if (!claimed) {
    // fetch the encrypted conversation key from the server
    const winnerRow = await getEncryptedConversationKey(conversationId);
    // if nonce and encypted conversation exists then open the conversation
    //( decrypt the conversation using user's private key and encrypted conversation key)
    if (winnerRow?.encryptedConversationKey && winnerRow?.nonce) {
<<<<<<< Updated upstream
=======
      const cached = await getCachedConversationKey(
        conversationId,
        winnerRow.epoch,
      );
      if (cached) {
        conversationEpochCache.set(conversationId, winnerRow.epoch);
        return cached;
      }

>>>>>>> Stashed changes
      return openConversationKey({
        conversationId,
        row: winnerRow,
        receiverPrivateKey: currentUserPrivateKey,
      });
    }
    return null;
  }

  // if no conversation key was found till now then a conversation key of random 32 byte is created
  const conversationKey = await generateConversationKey();
  // stores the encrypted conversation key for each member
  await storeEncryptedConversationKeysForMembers({
    conversationId,
    memberIds,
    conversationKey,
    currentUserPrivateKey,
  });
  // cache the converastion key
  cacheConversationKey(conversationId, conversationKey);

  return conversationKey; // returns the encrypted conversation key
}

export async function shareConversationKeyWithMembers({
  conversationId,
  memberIds,
}: {
  conversationId: string;
  memberIds: number[];
}) {
  // gets or creates the conversation key for the conversation
  const conversationKey = await getOrCreateConversationKey(
    conversationId,
    memberIds,
  );
  if (!conversationKey) return false;

  // gets the user's private key
  const currentUserPrivateKey = await getCurrentUserPrivateKey();
  if (!currentUserPrivateKey) return false;

  // encrypts and stores the conversation key for each member
  await storeEncryptedConversationKeysForMembers({
    conversationId,
    memberIds,
    conversationKey,
    currentUserPrivateKey,
  });
  return true;
}

export async function getKeyGaps(conversationId: number) {
  const response = await api.get(
    `/api/conversations/${conversationId}/key-gaps`,
  );

  return response.data;
}
export async function getHistoricalKeysToShare(
  conversationId: number,
  userId: number,
) {
  const response = await getKeyGaps(conversationId);

  const recipient = response.recipients.find(
    (member: { userId: number; missingEpochs: number[] }) =>
      member.userId === userId,
  );

  const result: { epoch: number; conversationKey: Uint8Array }[] = [];

  for (const epoch of recipient?.missingEpochs ?? []) {
    const conversationKey = await getConversationKeyForEpoch(
      conversationId,
      epoch,
    );

    if (conversationKey) {
      result.push({ epoch, conversationKey });
    }
  }

  return result;
}

export async function sendHistoricalKeysToMember({
  conversationId,
  userId,
}: {
  conversationId: number;
  userId: number;
}) {
  // get all the keys
  const keys = await getHistoricalKeysToShare(conversationId, userId);
  const receiverPublicKey = await getUserPublicKey(userId); // receiver's public key

  const userPrivateKey = await getCurrentUserPrivateKey(); // user's private key

  if (!userPrivateKey || !receiverPublicKey) return;

  const packages: {
    epoch: number;
    encryptedKey: string;
    nonce: string;
  }[] = [];

  // for each key encrypt it
  for (const key of keys) {
    const { encryptedKey, nonce } = await generateEncryptedKey({
      senderPrivateKey: Base64.toUint8Array(userPrivateKey),
      receiverPublicKey: Base64.toUint8Array(receiverPublicKey),
      conversationKey: key.conversationKey,
    });

    packages.push({
      epoch: key.epoch,
      encryptedKey: Base64.fromUint8Array(encryptedKey),
      nonce: Base64.fromUint8Array(nonce),
    });
  }

  // stores the data in table server
  await api.put(
    `/api/conversations/${conversationId}/historical-keys/${userId}`,
    { historicalKeys: packages },
  );
}

export async function getReceivedHistoricalKeyPackages(
  conversationId: number,
): Promise<HistoricalKeyPackagesResponse> {
  const response = await api.get(`/api/conversations/${conversationId}/keys`);

  return response.data;
}

export type HistoricalKeyPackagesResponse = {
  currentKeyEpoch: number;
  acknowledgedEpochs: number[];
  packages: {
    id: number;
    epoch: number;
    nonce: string;
    encryptedKey: string;
    senderUserId: number;
  }[];
};
export async function decryptHistoricalKeyPackages({
  conversationId,
  messages,
}: {
  conversationId: number;
  messages: Message[];
}) {
  const encryptedHistoricalKeys = await getReceivedHistoricalKeyPackages(
    conversationId,
  );

  const userPrivateKey = await getCurrentUserPrivateKey();
  if (!userPrivateKey) return [];

  const receiverPrivateKey = Base64.toUint8Array(userPrivateKey);
  await sodium.ready;
  if (receiverPrivateKey.length !== sodium.crypto_box_SECRETKEYBYTES) {
    console.warn(
      "Could not process historical keys: invalid receiver private key.",
    );
    return [];
  }

  const senderPublicKeys = new Map<number, string>();
  const storedEpochs: number[] = [];

  for (const keyPackage of encryptedHistoricalKeys.packages) {
    const epoch = Number(keyPackage.epoch);
    if (
      !Number.isInteger(epoch) ||
      epoch < 1 ||
      epoch >= encryptedHistoricalKeys.currentKeyEpoch ||
      encryptedHistoricalKeys.acknowledgedEpochs.includes(epoch) ||
      storedEpochs.includes(epoch)
    ) {
      continue;
    }

    const epochMessages = messages.filter(
      (message) =>
        message.id > 0 &&
        Number(message.conversationId) === conversationId &&
        Number(message.keyEpoch ?? 1) === epoch &&
        typeof message.encryptedText === "string" &&
        message.encryptedText.length > 0 &&
        message.encryptedText !== "[Encrypted Message]",
    );
    if (epochMessages.length === 0) continue;

    let senderPublicKey: string;
    try {
      if (
        !Number.isInteger(keyPackage.senderUserId) ||
        keyPackage.senderUserId < 1
      ) {
        continue;
      }
      senderPublicKey =
        senderPublicKeys.get(keyPackage.senderUserId) ??
        (await getUserPublicKey(keyPackage.senderUserId));
      senderPublicKeys.set(keyPackage.senderUserId, senderPublicKey);
      if (!senderPublicKey) continue;
    } catch (error) {
      console.warn(
        `Could not retrieve sender public key for historical epoch ${epoch}:`,
        error,
      );
      continue;
    }

    const senderPublicKeyBytes = Base64.toUint8Array(senderPublicKey);
    if (senderPublicKeyBytes.length !== sodium.crypto_box_PUBLICKEYBYTES) {
      console.warn(
        `Could not validate historical key package for epoch ${epoch}: invalid sender public key.`,
      );
      continue;
    }

    let conversationKey: Uint8Array;
    try {
      ({ conversationKey } = await decryptConversationKey({
        encryptedConversationKey: Base64.toUint8Array(
          keyPackage.encryptedKey,
        ),
        receiverPrivateKey,
        senderPublicKey: senderPublicKeyBytes,
        nonce: Base64.toUint8Array(keyPackage.nonce),
      }));
    } catch (error) {
      console.warn(`Invalid historical key package for epoch ${epoch}:`, error);
      try {
        await api.delete(
          `/api/conversations/${conversationId}/keys/packages/${keyPackage.id}/reject`,
        );
      } catch (rejectError) {
        console.warn(
          `Could not reject invalid historical key package ${keyPackage.id}:`,
          rejectError,
        );
      }
      continue;
    }

    let validated = false;
    for (const message of epochMessages) {
      const encryptedText = message.encryptedText;
      if (typeof encryptedText !== "string") continue;

      try {
        const { decryptMessage: plaintext } = await decryptMessage({
          encryptedMessage: encryptedText,
          nonce: message.nonce,
          decryptedConversationKey: conversationKey,
        });
        if (plaintext !== "[Encrypted Message]") {
          validated = true;
          break;
        }
      } catch (error) {
        console.warn(
          `Could not validate historical key for epoch ${epoch}:`,
          error,
        );
      }
    }

    if (!validated) continue;

    const stored = await setConversationKeyCache(
      conversationId,
      epoch,
      Base64.fromUint8Array(conversationKey),
    );
    if (!stored) continue;

    conversationKeyCache.set(`${conversationId}:${epoch}`, conversationKey);
    storedEpochs.push(epoch);
  }

  if (storedEpochs.length > 0) {
    try {
      await api.post(`/api/conversations/${conversationId}/keys/ack`, {
        epochs: storedEpochs,
      });
    } catch (error) {
      console.warn(
        `Could not acknowledge stored historical keys for conversation ${conversationId}:`,
        error,
      );
    }
  }

  return storedEpochs;
}

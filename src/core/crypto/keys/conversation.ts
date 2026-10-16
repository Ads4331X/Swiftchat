import sodiumModule from "@/core/crypto/sodium";
import { Base64 } from "js-base64";
import { api } from "@/core/api";
import { getConversationKeyCache, setConversationKeyCache } from "@/core/db";
import { getCurrentUserPrivateKey } from "@/core/crypto/keys/identityStorage";

const sodium = (sodiumModule as any).default ?? sodiumModule;
// creating a temp cache while the conversation is open
const conversationKeyCache = new Map<string, Uint8Array>();

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
  return conversationKeyCache.get(String(conversationId)) ?? null;
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
  const cached = await getCachedConversationKey(conversationId); // gets the conversaion key from the cache
  if (cached) return cached;

  // gets the users private key
  const currentUserPrivateKey = await getCurrentUserPrivateKey();
  if (!currentUserPrivateKey) return null;

  // gets the encrypted conversation key as base64
  const row = await getEncryptedConversationKey(conversationId);
  // if encrypted conversation key and nonce exist then open the conversation
  //( decrypt the conversation using user's private key and encrypted conversation key)
  if (row?.encryptedConversationKey && row?.nonce) {
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

import { getDb } from "@/core/db/connection";

export async function getConversationKeyCache(
  conversationId: number,
  epoch: number,
): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const row = await db.getFirstAsync<{ keyBase64: string }>(
      `SELECT keyBase64 FROM ConversationKey
       WHERE conversationId = ? AND epoch = ?`,
      [conversationId, epoch],
    );

    return row?.keyBase64 ?? null;
  } catch (err) {
    console.warn("getConversationKeyCache skipped:", err);
    return null;
  }
}

export async function setConversationKeyCache(
  conversationId: number,
  epoch: number,
  keyBase64: string,
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    await db.runAsync(
      `INSERT OR REPLACE INTO ConversationKey
       (conversationId, epoch, keyBase64) VALUES (?, ?, ?)`,
      [conversationId, epoch, keyBase64],
    );
    return true;
  } catch (err) {
    console.warn("setConversationKeyCache skipped:", err);
    return false;
  }
}

export async function clearConversationKeyCache(conversationId: number) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`DELETE FROM ConversationKey WHERE conversationId = ?`, [
      conversationId,
    ]);
  } catch (err) {
    console.warn("clearConversationKeyCache skipped:", err);
  }
}



// export async function getConversationKeyForEpoch(
//   conversationId: number,
//   epoch: number,
// ) {
//   try {
//     const db = await getDb();
//     if (!db) return;

//     const row = await db.getFirstAsync<{ keyBase64: string }>(
//       `SELECT keyBase64 FROM ConversationKey
//        WHERE conversationId = ? AND epoch = ?`,
//       [conversationId, epoch],
//     );

//     return row?.keyBase64 ?? null;
//   } catch (err) {
//     console.warn("getconversationKeyForEpoch skipped:", err);
//   }
// }

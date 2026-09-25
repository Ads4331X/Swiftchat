import { getDb } from "./index";

export async function getConversationKeyCache(
  conversationId: number,
): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const row = await db.getFirstAsync<{ keyBase64: string }>(
      `SELECT keyBase64 FROM ConversationKey WHERE conversationId = ?`,
      [conversationId],
    );
    return row?.keyBase64 ?? null;
  } catch (err) {
    console.warn("getConversationKeyCache skipped:", err);
    return null;
  }
}

export async function setConversationKeyCache(
  conversationId: number,
  keyBase64: string,
) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO ConversationKey (conversationId, keyBase64) VALUES (?, ?)`,
      [conversationId, keyBase64],
    );
  } catch (err) {
    console.warn("setConversationKeyCache skipped:", err);
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

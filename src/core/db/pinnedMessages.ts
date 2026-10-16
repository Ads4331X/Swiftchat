import { getDb } from "@/core/db/connection";

export async function savePinnedMessage({
  conversationId,
  messageId,
}: {
  conversationId: number;
  messageId: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO PinnedMessage (conversationId, messageId) VALUES (?, ?)`,
      [conversationId, messageId],
    );
  } catch (err) {
    console.warn("savePinnedMessage skipped:", err);
  }
}

export async function deletePinnedMessageLocal({
  conversationId,
}: {
  conversationId: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`DELETE FROM PinnedMessage WHERE conversationId = ?`, [
      conversationId,
    ]);
  } catch (err) {
    console.warn("deletePinnedMessageLocal skipped:", err);
  }
}

export async function getPinnedMessageLocal(conversationId: number) {
  try {
    const db = await getDb();
    if (!db) return null;
    return await db.getFirstAsync<{
      conversationId: number;
      messageId: number;
    }>(`SELECT * FROM PinnedMessage WHERE conversationId = ?`, [
      conversationId,
    ]);
  } catch (err) {
    console.warn("getPinnedMessageLocal skipped:", err);
    return null;
  }
}
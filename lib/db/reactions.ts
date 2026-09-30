import { getDb } from "./connection";

export async function updateMessageReactions({
  messageId,
  reactions,
}: {
  messageId: number;
  reactions: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`UPDATE Message SET reactions = ? WHERE id = ?`, [
      reactions,
      messageId,
    ]);
  } catch (err) {
    console.warn("updateMessageReactions skipped:", err);
  }
}
import { getDb } from "./connection";


export async function markRead({
  messageId,
  userId,
  conversationId,
  readAt,
}: {
  messageId: number;
  userId: number;
  conversationId: number;
  readAt: string;
}) {
  const db = await getDb();

  if (!db) return null;

  return await db.runAsync(
    `INSERT OR REPLACE INTO MessageRead
      (messageId, userId, conversationId, readAt)
     VALUES (?, ?, ?, ?)`,
    [messageId, userId, conversationId, readAt],
  );
}

export async function getMessageRead(conversationId: number) {
  const db = await getDb();

  if (!db) return null;

  return await db.getFirstAsync<{
    messageId: number;
    conversationId: number;
    userId: number;
    readAt: string;
  }>(
    `SELECT *
     FROM MessageRead
     WHERE messageId = ?
     LIMIT 1`,
    [conversationId],
  );
}
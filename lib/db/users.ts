import { getDb } from "./index";

export async function getUser(userId: number) {
  try {
    const db = await getDb();
    if (!db) return null;
    return await db.getFirstAsync<{
      id: number;
      username: string;
      avatarUrl: string | null;
    }>(`SELECT * FROM User WHERE id = ?`, [userId]);
  } catch (err) {
    console.warn("getUser skipped:", err);
    return null;
  }
}

export async function upsertUser(
  userId: number,
  username: string,
  avatarUrl?: string,
) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO User (id, username, avatarUrl) VALUES (?, ?, ?)`,
      [userId, username, avatarUrl ?? null],
    );
  } catch (err) {
    console.warn("upsertUser skipped:", err);
  }
}
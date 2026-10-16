import { getDb } from "@/core/db/connection";

// gets the detail of user from its id
export async function getUser(userId: number) {
  try {
    const db = await getDb();
    if (!db) return null;
    return await db.getFirstAsync<{
      id: number;
      username: string;
      avatarUrl: string | null;
      localAvatarUrlPath: string | null;
    }>(`SELECT * FROM User WHERE id = ?`, [userId]);
  } catch (err) {
    console.warn("getUser skipped:", err);
    return null;
  }
}

// upsert user details
export async function upsertUser(
  userId: number,
  username: string,
  avatarUrl?: string,
) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT INTO User (id, username, avatarUrl)
   VALUES (?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     username = excluded.username,
     avatarUrl = excluded.avatarUrl`,
      [userId, username, avatarUrl ?? null],
    );
  } catch (err) {
    console.warn("upsertUser skipped:", err);
  }
}

// changes the lastseen col of table to null
export async function setUserActive(userId: number, lastseen: Date | null) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`UPDATE User SET lastseen = ? WHERE id = ?`, [
      String(lastseen),
      userId,
    ]);
  } catch (err) {
    console.warn("setUserActive skipped:", err);
  }
}

// sets up the avatar url
export async function setAvatarUrl({
  url,
  userId,
}: {
  url: string;
  userId: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`UPDATE User SET avatarUrl = ? WHERE id = ?`, [
      String(url),
      userId,
    ]);
  } catch (err) {
    console.warn("setAvatarUrl skipped:", err);
  }
}

// sets up the local path of the avatar
export async function setLocalAvatarUrlPath({
  url,
  userId,
}: {
  url: string;
  userId: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`UPDATE User SET LocalAvatarUrlPath = ? WHERE id = ?`, [
      String(url),
      userId,
    ]);
  } catch (err) {
    console.warn("setLocalAvatarUrlPath skipped:", err);
  }
}

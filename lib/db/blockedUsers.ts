import { getDb } from ".";

export async function getBlockedUserIds(): Promise<number[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.getAllAsync<{ userId: number }>(
      `SELECT userId FROM BlockedUser`,
    );

    return rows.map((row) => row.userId);
  } catch (err) {
    console.warn("getBlockedUserIds skipped:", err);
    return [];
  }
}

export async function addBlockedUser(userId: number) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.runAsync(`INSERT INTO BlockedUser (userId) VALUES (?)`, [userId]);
  } catch (err) {
    console.warn("Could not add the block user locally", err);
  }
}

export async function removeBlockedUser(userId: number) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.runAsync(`DELETE FROM BlockedUser WHERE userId = ?`, [userId]);
  } catch (err) {
    console.warn("removeBlockedUser skipped:", err);
  }
}

export async function clearBlockedUsers() {
  try {
    const db = await getDb();
    if (!db) return;

    await db.runAsync(`DELETE FROM BlockedUser`);
  } catch (err) {
    console.warn("clearBlockedUsers skipped:", err);
  }
}

export async function syncBlockedUsers(blockedUserIdsServer: number[]) {
  try {
    const localBlock = await getBlockedUserIds();
    const serverBlocked = new Set(blockedUserIdsServer);
    const localBlocked = new Set(localBlock);
    // Server has it local doesnt add locally
    for (const userId of serverBlocked) {
      if (!localBlocked.has(userId)) {
        await addBlockedUser(userId);
      }
    }

    // Local has it server doesnt  remove locally
    for (const userId of localBlocked) {
      if (!serverBlocked.has(userId)) {
        await removeBlockedUser(userId);
      }
    }
  } catch (err) {
    console.warn("syncBlockedUsers skipped:", err);
  }
}

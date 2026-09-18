import { getDb, isFts5Available } from ".";

export async function indexMessage({
  messageId,
  content,
}: {
  messageId: number;
  content: string;
}) {
  try {
    if (!isFts5Available()) return;

    const db = await getDb();
    if (!db) return;

    await db.runAsync(
      `INSERT OR IGNORE INTO MessageSearch (rowid, content) VALUES (?, ?)`,
      [messageId, content],
    );
  } catch (err) {
    console.warn("indexMessage skipped:", err);
  }
}

export async function removeMessageFromSearch({
  messageId,
}: {
  messageId: number;
}) {
  try {
    if (!isFts5Available()) return;
    const db = await getDb();
    if (!db) return;

    await db.runAsync(`DELETE FROM MessageSearch WHERE rowid = ?`, [messageId]);
  } catch (err) {
    console.warn("removeMessageFromSearch skipped:", err);
  }
}

export async function searchMessages({ content }: { content: string }) {
  try {
    if (!isFts5Available()) {
      console.log("FTS5 NOT AVAILABLE");
      return [];
    }

    const db = await getDb();

    if (!db) {
      console.log("NO DB");
      return [];
    }

    const results = await db.getAllAsync<{ rowid: number }>(
      `SELECT rowid FROM MessageSearch WHERE MessageSearch MATCH ?`,
      [`${content}*`],
    );

    return results;
  } catch (err) {
    console.warn("searchMessages skipped:", err);
    return [];
  }
}
export async function updateMessageInSearch({
  messageId,
  content,
}: {
  messageId: number;
  content: string;
}) {
  try {
    if (!isFts5Available()) return;
    const db = await getDb();
    if (!db) return;

    await db.runAsync(`UPDATE MessageSearch SET content = ? WHERE rowid = ?`, [
      content,
      messageId,
    ]);
  } catch (err) {
    console.warn("updateMessageInSearch skipped:", err);
  }
}

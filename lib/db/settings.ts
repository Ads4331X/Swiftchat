import { getDb } from "./index";

// set the setting datas
export async function setSetting(key: string, val: string) {
  const db = await getDb();
  if (!db) return null;

  return db.runAsync(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, val],
  );
}

// get the setting data
export async function getSetting(key: string) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    [key],
  );

  return result?.value ?? null;
}

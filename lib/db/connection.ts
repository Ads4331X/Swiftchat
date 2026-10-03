import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// Promise-cached so the database file is only ever opened once. On web the
// underlying OPFS handle is exclusive, so opening it again (e.g. from a
// Fast Refresh / hot-reload that left the old worker's handle behind) throws
// `NoModificationAllowedError`. Retrying with a small backoff lets the old
// worker release its handle before we try again.
let dbPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS Message (
    id INTEGER PRIMARY KEY,
    conversationId INTEGER NOT NULL,
    senderId INTEGER NOT NULL,
    text TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sentAt TEXT NOT NULL,
    editedAt TEXT,
    forwardedFromMsgId INTEGER,
    readAt Text NOT NULL DEFAULT '',
    read Boolean NOT NULL DEFAULT 0,
    reactions TEXT,
    replyToId INTEGER,
    repliedTo TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS Conversation (
    id INTEGER PRIMARY KEY,
    otherUserId INTEGER,
    otherUsername TEXT,
    otherAvatarUrl TEXT,
    lastMessageText TEXT,
    lastMessageSentAt TEXT,
    clearedAt TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS PendingMessage (
    id INTEGER PRIMARY KEY,
    conversationId INTEGER NOT NULL,
    senderId INTEGER NOT NULL,
    text TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sentAt TEXT NOT NULL,
    editedAt TEXT,
    replyToId INTEGER,
    forwardedFromMsgId INTEGER,
    repliedTo TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS User (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    avatarUrl TEXT,
    localAvatarUrlPath TEXT,
    lastseen TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS MessageRead (
    id INTEGER PRIMARY KEY,
    messageId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    conversationId INTEGER NOT NULL,
    readAt TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS PinnedMessage (
    conversationId INTEGER PRIMARY KEY,
    messageId INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS ConversationKey (
    conversationId INTEGER PRIMARY KEY,
    keyBase64 TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS BlockedUser (
  userId INTEGER PRIMARY KEY
);`,
];

let fts5Available = false;

export function isFts5Available(): boolean {
  return fts5Available;
}

async function openDbOnce(): Promise<SQLite.SQLiteDatabase | null> {
  const maxAttempts = isWeb ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const database = await SQLite.openDatabaseAsync("Message");
      if (!isWeb) {
        try {
          await database.execAsync("PRAGMA journal_mode = WAL;");
        } catch {}
      }

      for (const stmt of STATEMENTS) {
        await database.execAsync(stmt);
      }
      try {
        await database.execAsync(
          `CREATE VIRTUAL TABLE IF NOT EXISTS MessageSearch USING fts5(content);`,
        );
        fts5Available = true;
      } catch (ftsErr) {
        fts5Available = false;
        console.warn(
          "FTS5 SQLite extension is unavailable on this device/runtime. Local search will be disabled.",
          ftsErr,
        );
      }
      try {
        await database.execAsync(
          `ALTER TABLE User ADD COLUMN localAvatarUrlPath TEXT;`,
        );
      } catch {}
      try {
        await database.execAsync(`ALTER TABLE User ADD COLUMN lastseen TEXT;`);
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE Conversation ADD COLUMN clearedAt TEXT;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE Message ADD COLUMN forwardedFromMsgId INTEGER;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE PendingMessage ADD COLUMN forwardedFromMsgId INTEGER;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE Conversation ADD COLUMN otherUserId INTEGER;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE Conversation ADD COLUMN otherAvatarUrl TEXT;`,
        );
      } catch {}
      try {
        await database.execAsync(`ALTER TABLE Message ADD COLUMN nonce TEXT;`);
      } catch {}
      try {
        await database.execAsync(`ALTER TABLE Message ADD COLUMN reactions TEXT;`);
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE Message ADD COLUMN replyToId INTEGER;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE Message ADD COLUMN repliedTo TEXT;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE PendingMessage ADD COLUMN replyToId INTEGER;`,
        );
      } catch {}
      try {
        await database.execAsync(
          `ALTER TABLE PendingMessage ADD COLUMN repliedTo TEXT;`,
        );
      } catch {}
      // `MessageRead` was written by an INSERT that never supplied the `id`
      // primary key. Since `id INTEGER PRIMARY KEY` is a rowid alias, SQLite
      // auto-assigned a fresh rowid every time, so `INSERT OR REPLACE` never
      // saw a conflict and each mark-read event appended a duplicate for the
      // same (messageId, userId). Collapse the existing pile (keeping the
      // newest row per pair) and enforce the constraint so later writes
      // replace instead of accumulate.
      try {
        await database.execAsync(
          `DELETE FROM MessageRead WHERE id NOT IN (
             SELECT MAX(id) FROM MessageRead GROUP BY messageId, userId
           );`,
        );
        await database.execAsync(
          `CREATE UNIQUE INDEX IF NOT EXISTS MessageRead_messageId_userId
             ON MessageRead (messageId, userId);`,
        );
      } catch (err) {
        console.warn("MessageRead dedupe migration skipped:", err);
      }
      // The flusher matches queued rows to delivered ones by nonce, and the
      // reconcile pass matches optimistic rows by nonce too.
      try {
        await database.execAsync(
          `CREATE INDEX IF NOT EXISTS Message_nonce ON Message (nonce);`,
        );
      } catch (err) {
        console.warn("Message.nonce index creation skipped:", err);
      }
      console.log("SQLite database initialized");
      return database;
    } catch (error) {
      lastError = error;
      if (!isWeb || attempt >= maxAttempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }

  if (isWeb) {
    console.warn(
      "Web SQLite cache disabled — falling back to API data",
      lastError,
    );
    return null;
  }

  console.error("SQLite database failed to open", lastError);
  throw lastError;
}

export function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (!dbPromise) {
    dbPromise = openDbOnce().catch((error) => {
      dbPromise = null;
      if (isWeb) return null;
      throw error;
    });
  }
  return dbPromise;
}

import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// Promise-cached so the database file is only ever opened once. On web the
// underlying OPFS handle is exclusive, so opening it again (e.g. from a
// Fast Refresh / hot-reload that left the old worker's handle behind) throws
// `NoModificationAllowedError`. Retrying with a small backoff lets the old
// worker release its handle before we try again.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS Message (
    id INTEGER PRIMARY KEY,
    conversationId INTEGER NOT NULL,
    senderId INTEGER NOT NULL,
    text TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sentAt TEXT NOT NULL,
    editedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS Conversation (
    id INTEGER PRIMARY KEY,
    otherUsername TEXT,
    otherAvatarUrl TEXT,
    lastMessageText TEXT,
    lastMessageSentAt TEXT
  );
`;

async function openDbOnce(): Promise<SQLite.SQLiteDatabase> {
  const maxAttempts = isWeb ? 5 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const database = await SQLite.openDatabaseAsync("Message");
      // WAL needs shared-memory support that wa-sqlite's OPFS adapter only
      // gets with exclusive locking, and it adds extra files to the OPFS
      // pool (which has a hard capacity). On web the default journal mode is
      // plenty for a local cache, so skip WAL there.
      const pragmas = isWeb ? "" : "PRAGMA journal_mode = WAL;";
      await database.execAsync(`${pragmas}\n${SCHEMA}`);
      // Migration: add otherAvatarUrl if missing (existing DBs)
      try {
        await database.execAsync(
          `ALTER TABLE Conversation ADD COLUMN otherAvatarUrl TEXT`,
        );
      } catch {
        // column already exists — ignore
      }
      try {
        await database.execAsync(`ALTER TABLE Message ADD COLUMN nonce TEXT`);
      } catch {
        // column already exists — ignore
      }
      console.log("SQLite database initialized");
      return database;
    } catch (error) {
      lastError = error;
      if (!isWeb || attempt >= maxAttempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  console.error("SQLite database failed to open", lastError);
  throw lastError;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDbOnce().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

type SaveMsgParams = {
  messageId: number;
  message: string;
  sentAt: string;
  SenderId: number;
  ConversationId: number;
  nonce: string;
};

export async function saveMessage({
  message,
  sentAt,
  SenderId,
  ConversationId,
  messageId,
  nonce,
}: SaveMsgParams) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO Message (id, text, sentAt, senderId, conversationId , nonce) VALUES (?, ?, ?, ?, ? , ?)`,
    [messageId, message, sentAt, SenderId, ConversationId, nonce],
  );
}

// update msg locally
type UpdateMsg = {
  messageId: number;
  editedAt: string;
  message: string;
  nonce: string;
};

export async function updateMsg({
  messageId,
  editedAt,
  message,
  nonce,
}: UpdateMsg) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE Message SET text = ?, editedAt = ? , nonce = ? WHERE id = ?`,
    [message, editedAt, nonce, messageId],
  );
}

// delete message locally
type DeleteMsg = {
  messageId: number;
};

export async function deleteMsg({ messageId }: DeleteMsg) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM Message WHERE id = ?`, [messageId]);
}

// read all messages for a conversation
type ReadMsgs = {
  conversationId: number;
};

export async function readMsgs({ conversationId }: ReadMsgs) {
  const db = await getDb();
  const messages = await db.getAllAsync(
    `SELECT * FROM Message WHERE conversationId = ? ORDER BY sentAt ASC`,
    [conversationId],
  );

  return messages;
}

// read messages paginated (for infinite scroll — fetch older messages)
type ReadMsgsPaginated = {
  conversationId: number;
  before?: string; // sentAt cursor — fetch messages older than this
  limit?: number;
};

export async function readMsgsPaginated({
  conversationId,
  before,
  limit = 50,
}: ReadMsgsPaginated) {
  const db = await getDb();
  if (before) {
    return db.getAllAsync(
      `SELECT * FROM Message WHERE conversationId = ? AND sentAt < ? ORDER BY sentAt ASC LIMIT ?`,
      [conversationId, before, limit],
    );
  }
  return db.getAllAsync(
    `SELECT * FROM Message WHERE conversationId = ? ORDER BY sentAt ASC LIMIT ?`,
    [conversationId, limit],
  );
}

// save conversation locally
type SaveConversationParams = {
  id: number;
  otherUsername: string;
  otherAvatarUrl?: string;
  lastMessageText: string;
  lastMessageSentAt: string;
};

export async function saveConversation({
  id,
  otherUsername,
  otherAvatarUrl,
  lastMessageText,
  lastMessageSentAt,
}: SaveConversationParams) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO Conversation (id, otherUsername, otherAvatarUrl, lastMessageText, lastMessageSentAt) VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      otherUsername,
      otherAvatarUrl ?? "",
      lastMessageText,
      lastMessageSentAt,
    ],
  );
}

// Update only the last-message preview of a cached conversation so the list
// stays in sync with incoming/sent messages without needing the full member
// data (unlike saveConversation).
export async function updateConversationPreview({
  id,
  lastMessageText,
  lastMessageSentAt,
}: {
  id: number;
  lastMessageText: string;
  lastMessageSentAt: string;
}) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE Conversation SET lastMessageText = ?, lastMessageSentAt = ? WHERE id = ?`,
    [lastMessageText, lastMessageSentAt, id],
  );
}

// read all cached conversations
export type CachedConversation = {
  id: number;
  members: { id: number; username: string; avatar?: string }[];
  lastMessage: {
    id: number;
    text: string;
    nonce?: string;
    sentAt: string;
    senderId: number;
  } | null;
};

export async function getConversations(): Promise<CachedConversation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    otherUsername: string | null;
    otherAvatarUrl: string | null;
    lastMessageText: string | null;
    lastMessageSentAt: string | null;
  }>(`SELECT * FROM Conversation ORDER BY lastMessageSentAt DESC`);
  return rows.map((c) => ({
    id: c.id,
    members: [
      {
        id: -1,
        username: c.otherUsername ?? "Unknown",
        avatar: c.otherAvatarUrl ?? undefined,
      },
    ],
    lastMessage: c.lastMessageText
      ? {
          id: -1,
          text: c.lastMessageText,
          sentAt: c.lastMessageSentAt ?? "",
          senderId: -1,
        }
      : null,
  }));
}

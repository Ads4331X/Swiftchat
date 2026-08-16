import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase;

async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("Message");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS Message (
        id INTEGER PRIMARY KEY,
        conversationId INTEGER NOT NULL,
        senderId INTEGER NOT NULL,
        text TEXT NOT NULL,
        sentAt TEXT NOT NULL,
        editedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS Conversation (
        id INTEGER PRIMARY KEY,
        otherUsername TEXT,
        lastMessageText TEXT,
        lastMessageSentAt TEXT
      );
    `);
    console.log("SQLite database initialized");
  }
  return db;
}

type SaveMsgParams = {
  messageId: number;
  message: string;
  sentAt: string;
  SenderId: number;
  ConversationId: number;
};

export async function saveMessage({
  message,
  sentAt,
  SenderId,
  ConversationId,
  messageId,
}: SaveMsgParams) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO Message (id, text, sentAt, senderId, conversationId) VALUES (?, ?, ?, ?, ?)`,
    [messageId, message, sentAt, SenderId, ConversationId],
  );
}

// update msg locally
type UpdateMsg = {
  messageId: number;
  editedAt: string;
  message: string;
};

export async function updateMsg({ messageId, editedAt, message }: UpdateMsg) {
  const db = await getDb();
  await db.runAsync(`UPDATE Message SET text = ?, editedAt = ? WHERE id = ?`, [
    message,
    editedAt,
    messageId,
  ]);
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

// save conversation locally
type SaveConversationParams = {
  id: number;
  otherUsername: string;
  lastMessageText: string;
  lastMessageSentAt: string;
};

export async function saveConversation({
  id,
  otherUsername,
  lastMessageText,
  lastMessageSentAt,
}: SaveConversationParams) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO Conversation (id, otherUsername, lastMessageText, lastMessageSentAt) VALUES (?, ?, ?, ?)`,
    [id, otherUsername, lastMessageText, lastMessageSentAt],
  );
}

// read all cached conversations
export type CachedConversation = {
  id: number;
  members: { id: number; username: string }[];
  lastMessage: {
    id: number;
    text: string;
    sentAt: string;
    senderId: number;
  } | null;
};

export async function getConversations(): Promise<CachedConversation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    otherUsername: string | null;
    lastMessageText: string | null;
    lastMessageSentAt: string | null;
  }>(`SELECT * FROM Conversation ORDER BY lastMessageSentAt DESC`);
  return rows.map((c) => ({
    id: c.id,
    members: [{ id: -1, username: c.otherUsername ?? "Unknown" }],
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

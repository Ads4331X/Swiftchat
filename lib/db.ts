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
    readAt Text NOT NUll,
    read Boolean NOT NULL,
    reactions TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS Conversation (
    id INTEGER PRIMARY KEY,
    otherUserId INTEGER,
    otherUsername TEXT,
    otherAvatarUrl TEXT,
    lastMessageText TEXT,
    lastMessageSentAt TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS PendingMessage (
    id INTEGER PRIMARY KEY,
    conversationId INTEGER NOT NULL,
    senderId INTEGER NOT NULL,
    text TEXT NOT NULL,
    nonce TEXT NOT NULL,
    sentAt TEXT NOT NULL,
    editedAt TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS User (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    avatarUrl TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS MessageRead (
    id INTEGER PRIMARY KEY,
    messageId INTEGER NOT NULL,
    userId INTEGER NOT NULL,
    conversationId INTEGER NOT NULL,
    readAt TEXT NOT NULL
  );`,
];

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
        await database.execAsync(
          `ALTER TABLE Message ADD COLUMN reactions TEXT;`,
        );
      } catch {}
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

function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (!dbPromise) {
    dbPromise = openDbOnce().catch((error) => {
      dbPromise = null;
      if (isWeb) return null;
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
  reactions?: string;
};

export async function saveMessage({
  message,
  sentAt,
  SenderId,
  ConversationId,
  messageId,
  nonce,
  reactions,
}: SaveMsgParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO Message (id, text, sentAt, senderId, conversationId , nonce, reactions) VALUES (?, ?, ?, ?, ? , ?, ?)`,
      [messageId, message, sentAt, SenderId, ConversationId, nonce, reactions ?? null],
    );
  } catch (err) {
    console.warn("saveMessage skipped:", err);
  }
}

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
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `UPDATE Message SET text = ?, editedAt = ? , nonce = ? WHERE id = ?`,
      [message, editedAt, nonce, messageId],
    );
  } catch (err) {
    console.warn("updateMsg skipped:", err);
  }
}

type DeleteMsg = {
  messageId: number;
};

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
    await db.runAsync(
      `UPDATE Message SET reactions = ? WHERE id = ?`,
      [reactions, messageId],
    );
  } catch (err) {
    console.warn("updateMessageReactions skipped:", err);
  }
}

export async function deleteMsg({ messageId }: DeleteMsg) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`DELETE FROM Message WHERE id = ?`, [messageId]);
  } catch (err) {
    console.warn("deleteMsg skipped:", err);
  }
}

type ReadMsgs = {
  conversationId: number;
};

export async function readMsgs({ conversationId }: ReadMsgs) {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db.getAllAsync(
      `SELECT * FROM Message WHERE conversationId = ? ORDER BY sentAt ASC`,
      [conversationId],
    );
  } catch (err) {
    console.warn("readMsgs skipped:", err);
    return [];
  }
}

type ReadMsgsPaginated = {
  conversationId: number;
  before?: string;
  limit?: number;
};

export async function readMsgsPaginated({
  conversationId,
  before,
  limit = 50,
}: ReadMsgsPaginated) {
  try {
    const db = await getDb();
    if (!db) return [];
    if (before) {
      return await db.getAllAsync(
        `SELECT * FROM Message WHERE conversationId = ? AND sentAt < ? ORDER BY sentAt ASC LIMIT ?`,
        [conversationId, before, limit],
      );
    }
    return await db.getAllAsync(
      `SELECT * FROM Message WHERE conversationId = ? ORDER BY sentAt ASC LIMIT ?`,
      [conversationId, limit],
    );
  } catch (err) {
    console.warn("readMsgsPaginated skipped:", err);
    return [];
  }
}

type SaveConversationParams = {
  id: number;
  otherUserId: number;
  otherUsername: string;
  otherAvatarUrl?: string;
  lastMessageText: string;
  lastMessageSentAt: string;
};

export async function saveConversation({
  id,
  otherUserId,
  otherUsername,
  otherAvatarUrl,
  lastMessageText,
  lastMessageSentAt,
}: SaveConversationParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO Conversation (id, otherUserId, otherUsername, otherAvatarUrl, lastMessageText, lastMessageSentAt) VALUES (?, ?, ?, ?, ? , ?)`,
      [
        id,
        otherUserId,
        otherUsername,
        otherAvatarUrl ?? "",
        lastMessageText,
        lastMessageSentAt,
      ],
    );
  } catch (err) {
    console.warn("saveConversation skipped:", err);
  }
}

export async function updateConversationPreview({
  id,
  lastMessageText,
  lastMessageSentAt,
}: {
  id: number;
  lastMessageText: string;
  lastMessageSentAt: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `UPDATE Conversation SET lastMessageText = ?, lastMessageSentAt = ? WHERE id = ?`,
      [lastMessageText, lastMessageSentAt, id],
    );
  } catch (err) {
    console.warn("updateConversationPreview skipped:", err);
  }
}

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
  try {
    const db = await getDb();
    if (!db) return [];

    const rows = await db.getAllAsync<{
      id: number;
      otherUserId: number | null;
      otherUsername: string | null;
      otherAvatarUrl: string | null;
      lastMessageText: string | null;
      lastMessageSentAt: string | null;
    }>(`SELECT * FROM Conversation ORDER BY lastMessageSentAt DESC`);

    return rows
      .filter(
        (c) =>
          c.otherUserId !== null &&
          c.otherUserId > 0 &&
          c.otherUsername !== null &&
          c.otherUsername.trim() !== "",
      )
      .map((c) => ({
        id: c.id,

        members: [
          {
            id: c.otherUserId ?? -1,
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
  } catch (err) {
    console.warn("getConversations skipped:", err);
    return [];
  }
}

export async function deleteConversation({
  conversationId,
}: {
  conversationId: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.runAsync(`DELETE FROM Conversation WHERE id = ?`, [
      conversationId,
    ]);
  } catch (err) {
    console.warn("deleteConversation skipped:", err);
  }
}

export async function clearAllLocalData() {
  try {
    const db = await getDb();
    if (!db) return;
    await db.execAsync("DELETE FROM Message;");
    await db.execAsync("DELETE FROM Conversation;");
    await db.execAsync("DELETE FROM PendingMessage;");
    await db.execAsync("DELETE FROM User;");
  } catch (err) {
    console.warn("clearAllLocalData skipped:", err);
  }
}

type ServerConversation = {
  id: number;
  conversationId?: number;
  userId?: number;
  username?: string;
  avatarUrl?: string;
  members?: { id: number; username: string; avatar?: string }[];
  lastMessage?: { text: string; sentAt: string } | null;
  lastMessageText?: string;
  lastMessageSentAt?: string;
};

export async function syncConversationsWithServer({
  serverConversations,
}: {
  serverConversations: ServerConversation[];
}) {
  try {
    const localConversations = await getConversations();
    const myId = await (await import("@/lib/auth")).getCurrentUserId();

    const serverConversationIds = new Set<number>();

    for (const conv of serverConversations) {
      const convId = conv.conversationId ?? conv.id;
      serverConversationIds.add(convId);

      if (conv.members && conv.members.length > 0) {
        const other =
          conv.members.find((m) => m.id !== myId) ?? conv.members[0];
        await saveConversation({
          id: convId,
          otherUserId: other.id,
          otherAvatarUrl: other.avatar,
          otherUsername: other.username,
          lastMessageSentAt:
            conv.lastMessage?.sentAt ?? conv.lastMessageSentAt ?? "",
          lastMessageText: conv.lastMessage?.text ?? conv.lastMessageText ?? "",
        });
      } else if (conv.userId) {
        await saveConversation({
          id: convId,
          otherUserId: conv.userId,
          otherAvatarUrl: conv.avatarUrl,
          otherUsername: conv.username ?? "Unknown",
          lastMessageSentAt: conv.lastMessageSentAt ?? "",
          lastMessageText: conv.lastMessageText ?? "",
        });
      }
    }

    for (const conversation of localConversations) {
      if (!serverConversationIds.has(conversation.id)) {
        await deleteConversation({ conversationId: conversation.id });
      }
    }
  } catch (err) {
    console.warn("syncConversationsWithServer skipped:", err);
  }
}

export async function savePendingMessage({
  message,
  sentAt,
  SenderId,
  ConversationId,
  messageId,
  nonce,
}: SaveMsgParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO PendingMessage (id, text, sentAt, senderId, conversationId , nonce) VALUES (?, ?, ?, ?, ? , ?)`,
      [messageId, message, sentAt, SenderId, ConversationId, nonce],
    );
  } catch (err) {
    console.warn("savePendingMessage skipped:", err);
  }
}

export async function updatePendingMessage({
  messageId,
  editedAt,
  message,
  nonce,
}: UpdateMsg) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `UPDATE PendingMessage SET text = ?, editedAt = ? , nonce = ? WHERE id = ?`,
      [message, editedAt, nonce, messageId],
    );
  } catch (err) {
    console.warn("updatePendingMessage skipped:", err);
  }
}

export async function deletePendingMessage({ messageId }: DeleteMsg) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`DELETE FROM PendingMessage WHERE id = ?`, [messageId]);
  } catch (err) {
    console.warn("deletePendingMessage skipped:", err);
  }
}

export type PendingMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  text: string;
  nonce: string;
  sentAt: string;
  editedAt: string | null;
};

export async function getPendingMessages(): Promise<PendingMessage[]> {
  try {
    const db = await getDb();
    if (!db) return [];

    return await db.getAllAsync<PendingMessage>(`
      SELECT *
      FROM PendingMessage
      ORDER BY sentAt ASC
    `);
  } catch (err) {
    console.warn("getPendingMessages skipped:", err);
    return [];
  }
}

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

export async function getConversationOtherUser(conversationId: number) {
  try {
    const db = await getDb();
    if (!db) return null;
    return await db.getFirstAsync<{
      otherUserId: number;
      otherUsername: string;
      otherAvatarUrl: string | null;
    }>(
      `SELECT otherUserId, otherUsername, otherAvatarUrl FROM Conversation WHERE id = ?`,
      [conversationId],
    );
  } catch (err) {
    console.warn("getConversationOtherUser skipped:", err);
    return null;
  }
}

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

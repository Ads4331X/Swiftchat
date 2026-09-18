import { Message } from "@/hooks/useChatMessages";
import { getDb } from "./index";

type SaveMsgParams = {
  messageId: number;
  message: string;
  sentAt: string;
  SenderId: number;
  ConversationId: number;
  nonce: string;
  reactions?: string;
  replyToId?: number;
  repliedTo?: string;
  forwardedFromMsgId?: number;
};

export async function saveMessage({
  message,
  sentAt,
  SenderId,
  ConversationId,
  messageId,
  nonce,
  reactions,
  replyToId,
  repliedTo,
  forwardedFromMsgId,
}: SaveMsgParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO Message (id, text, sentAt, senderId, conversationId, nonce, reactions, readAt, read, replyToId, repliedTo, forwardedFromMsgId) VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)`,
      [
        messageId,
        message,
        sentAt,
        SenderId,
        ConversationId,
        nonce,
        reactions ?? null,
        replyToId ?? null,
        repliedTo ?? null,
        forwardedFromMsgId ?? null,
      ],
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

export async function savePendingMessage({
  message,
  sentAt,
  SenderId,
  ConversationId,
  messageId,
  nonce,
  replyToId,
  repliedTo,
  forwardedFromMsgId,
}: SaveMsgParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      `INSERT OR REPLACE INTO PendingMessage (id, text, sentAt, senderId, conversationId, nonce, replyToId, repliedTo, forwardedFromMsgId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        message,
        sentAt,
        SenderId,
        ConversationId,
        nonce,
        replyToId ?? null,
        repliedTo ?? null,
        forwardedFromMsgId ?? null,
      ],
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
  replyToId?: number | null;
  repliedTo?: string | null;
  forwardedFromMsgId?: number | null;
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

export async function getMessagesByIds({
  messageIds,
}: {
  messageIds: number[];
}) {
  try {
    const db = await getDb();
    if (!db || messageIds.length === 0) return [];

    const placeholders = messageIds.map(() => "?").join(",");

    return await db.getAllAsync<Message>(
      `SELECT * FROM Message WHERE id IN (${placeholders})`,
      messageIds,
    );
  } catch (err) {
    console.warn("getMessagesByIds skipped:", err);
    return [];
  }
}

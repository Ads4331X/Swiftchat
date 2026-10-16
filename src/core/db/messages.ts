import { Message } from "@/types/message";
import { getDb } from "@/core/db/connection";

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
  attachment?: string;
};

// Shared by `saveMessage` and `confirmPendingMessage`. Upsert rather than
// INSERT OR REPLACE: `readAt`/`read` are only meaningful on first insert, and a
// blind REPLACE wiped them every time a message was re-cached (edits, socket
// refreshes, background flushes), making already-read messages look unread.
const MESSAGE_UPSERT_SQL = `INSERT INTO Message (id, text, sentAt, senderId, conversationId, nonce, reactions, readAt, read, replyToId, repliedTo, forwardedFromMsgId, attachment) VALUES (?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         text = excluded.text,
         sentAt = excluded.sentAt,
         senderId = excluded.senderId,
         conversationId = excluded.conversationId,
         nonce = excluded.nonce,
         reactions = excluded.reactions,
         replyToId = excluded.replyToId,
         repliedTo = excluded.repliedTo,
         forwardedFromMsgId = excluded.forwardedFromMsgId,
         attachment = COALESCE(excluded.attachment, Message.attachment)`;

const MESSAGE_UPSERT_PARAMS = ({
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
  attachment,
}: SaveMsgParams) => [
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
  attachment ?? null,
];

export async function saveMessage(params: SaveMsgParams) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(MESSAGE_UPSERT_SQL, MESSAGE_UPSERT_PARAMS(params));
  } catch (err) {
    console.warn("saveMessage skipped:", err);
  }
}

/**
 * Promote a queued row to its server-confirmed counterpart and drop the queue
 * entry in one transaction. These used to be two independent awaits, so a
 * crash between them left the same message present in BOTH `Message` and
 * `PendingMessage` — which the UI then rendered twice.
 */
export async function confirmPendingMessage({
  pendingId,
  ...message
}: SaveMsgParams & { pendingId: number }) {
  const db = await getDb();
  if (!db) return;

  await db.withTransactionAsync(async () => {
    await db.runAsync(MESSAGE_UPSERT_SQL, MESSAGE_UPSERT_PARAMS(message));
    await db.runAsync(`DELETE FROM PendingMessage WHERE id = ?`, [pendingId]);
  });
}

/**
 * Look up an already-delivered message by the client-generated nonce. Lets the
 * flusher detect "this was posted before the app died" and skip re-POSTing it.
 */
export async function getMessageByNonce({ nonce }: { nonce: string }) {
  try {
    const db = await getDb();
    if (!db || !nonce) return null;

    return await db.getFirstAsync<Message>(
      `SELECT * FROM Message WHERE nonce = ? LIMIT 1`,
      [nonce],
    );
  } catch (err) {
    console.warn("getMessageByNonce skipped:", err);
    return null;
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

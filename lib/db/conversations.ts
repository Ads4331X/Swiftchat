import { getDb } from "./connection";

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
      .filter((c) => Boolean(c && c.id))
      .map((c) => {
        const username =
          typeof c.otherUsername === "string" && c.otherUsername.trim() !== ""
            ? c.otherUsername.trim()
            : "Unknown";

        const hasMember = Boolean(c.otherUserId || c.otherUsername);

        return {
          id: c.id,

          members: hasMember
            ? [
                {
                  id: c.otherUserId ?? -1,
                  username,
                  avatar: c.otherAvatarUrl ?? undefined,
                },
              ]
            : [],

          lastMessage: c.lastMessageText
            ? {
                id: -1,
                text: c.lastMessageText,
                sentAt: c.lastMessageSentAt ?? "",
                senderId: -1,
              }
            : null,
        };
      });
  } catch (err) {
    console.warn("getConversations skipped:", err);
    return [];
  }
}

export async function clearChatLocalMessages(conversationId: number) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(`DELETE FROM MessageRead WHERE conversationId = ?`, [
      conversationId,
    ]);
    await db.runAsync(`DELETE FROM PendingMessage WHERE conversationId = ?`, [
      conversationId,
    ]);
    await db.runAsync(`DELETE FROM Message WHERE conversationId = ?`, [
      conversationId,
    ]);
    await db.runAsync(`DELETE FROM PinnedMessage WHERE conversationId = ?`, [
      conversationId,
    ]);
  } catch (err) {
    console.warn("clearChatLocalMessages skipped:", err);
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
    await db.runAsync(`DELETE FROM MessageRead where conversationId = ?`, [
      conversationId,
    ]);
    await db.runAsync(`DELETE FROM PendingMessage where conversationId = ?`, [
      conversationId,
    ]);
    await db.runAsync(`DELETE FROM Message where conversationId = ?`, [
      conversationId,
    ]);
    await db.runAsync(`DELETE FROM PinnedMessage where conversationId = ?`, [
      conversationId,
    ]);

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
    await db.execAsync("DELETE FROM PinnedMessage;");
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

export async function setConversationClearedAt({
  conversationId,
  clearedAt,
}: {
  conversationId: number;
  clearedAt: string;
}) {
  try {
    const db = await getDb();
    if (!db) return null;
    await db.runAsync(
      `INSERT INTO Conversation (id, clearedAt) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET clearedAt = excluded.clearedAt`,
      [conversationId, clearedAt],
    );
  } catch (err) {
    console.warn("Could not clear the chat locally", err);
  }
}

export async function getConversationClearedAt(conversationId: number) {
  try {
    const db = await getDb();
    if (!db) return null;

    return await db.getFirstAsync<{ clearedAt: string | null }>(
      `SELECT clearedAt FROM Conversation WHERE id = ?`,
      [conversationId],
    );
  } catch (err) {
    console.warn("getConversationClearedAt skipped:", err);
    return null;
  }
}

export async function clearConversationPreview(conversationId: number) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.runAsync(
      `UPDATE Conversation SET lastMessageText = NULL, lastMessageSentAt = NULL WHERE id = ?`,
      [conversationId],
    );
  } catch (err) {
    console.warn("clearConversationPreview skipped:", err);
  }
}

export async function getConversationMemberIds(
  conversationId: number,
  currentUserId: number,
) {
  try {
    const db = await getDb();
    if (!db) return [];

    const conversation = await db.getFirstAsync<{
      otherUserId: number | null;
    }>(`SELECT otherUserId FROM Conversation WHERE id = ?`, [conversationId]);

    if (!conversation?.otherUserId) return [];

    return [currentUserId, conversation.otherUserId];
  } catch (err) {
    console.warn("getConversationMemberIds skipped:", err);
    return [];
  }
}

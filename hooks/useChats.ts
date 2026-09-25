import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import {
  listenForNewMessages,
  joinConversations,
  listenForGroupDelete,
} from "@/lib/socket";
import {
  deleteConversation,
  getConversations,
  saveConversation,
  syncConversationsWithServer,
} from "@/lib/db";
import {
  clearChat as clearChatOnServer,
  getActiveConversation,
  onChatCleared,
} from "@/lib/sync";
import { getCurrentUserId } from "@/lib/auth";
import { decryptMessage, getOrCreateConversationKey } from "@/lib/crypto";
import NetInfo from "@react-native-community/netinfo";
import Toast from "react-native-toast-message";
import { reportPresence } from "@/constants/presence-provider";
import { syncBlockedUsers } from "@/lib/db/blockedUsers";

export type ChatMember = {
  id: number;
  username: string;
  avatar?: string;
  lastSeen?: string | null;
};

export type Chat = {
  id: number;
  name?: string;
  members: ChatMember[];
  lastMessage?: {
    id: number;
    text: string;
    nonce?: string;
    sentAt: string;
    senderId: number;
  } | null;
  unread?: number;
};

// this functions dedupes the chats based on the members of the chat. If two chats have the same members, it will keep only one of them.
function dedupe(chats: Chat[]): Chat[] {
  const seen = new Set<string>();

  return chats.filter((chat) => {
    const memberKey = chat.members
      .map((m) => m.id)
      .sort((a, b) => a - b)
      .join(",");
    const key = memberKey || `conversation:${chat.id}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

export function normalizeChat(value: unknown): Chat | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const id = Number(raw.id ?? raw.conversationId);
  if (!Number.isFinite(id)) return null;

  const members = Array.isArray(raw.members)
    ? (raw.members as unknown[])
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const rawMember = value as Record<string, unknown>;
          const member =
            rawMember.user && typeof rawMember.user === "object"
              ? (rawMember.user as Record<string, unknown>)
              : rawMember;
          const memberId = Number(member.id);
          if (!Number.isFinite(memberId)) return null;

          const normalizedMember: ChatMember = {
            id: memberId,
            username:
              typeof member.username === "string" ? member.username : "Unknown",
          };

          if (typeof member.avatar === "string") {
            normalizedMember.avatar = member.avatar;
          } else if (typeof member.avatarUrl === "string") {
            normalizedMember.avatar = member.avatarUrl;
          }

          if (typeof member.lastSeen === "string" || member.lastSeen === null) {
            normalizedMember.lastSeen = member.lastSeen;
          }

          return normalizedMember;
        })
        .filter((member): member is ChatMember => member !== null)
    : [];

  const rawLastMessage = raw.lastMessage;
  let lastMessage: Chat["lastMessage"] = null;
  if (rawLastMessage && typeof rawLastMessage === "object") {
    const message = rawLastMessage as Record<string, unknown>;
    const messageId = Number(message.id);
    const senderId = Number(message.senderId);
    if (
      Number.isFinite(messageId) &&
      Number.isFinite(senderId) &&
      typeof message.text === "string" &&
      typeof message.sentAt === "string"
    ) {
      lastMessage = {
        id: messageId,
        text: message.text,
        nonce: typeof message.nonce === "string" ? message.nonce : undefined,
        sentAt: message.sentAt,
        senderId,
      };
    }
  }

  return {
    id,
    name: typeof raw.name === "string" ? raw.name : undefined,
    members,
    lastMessage,
    unread: Number.isFinite(Number(raw.unread))
      ? Number(raw.unread)
      : undefined,
  };
}

export default function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const hasLoadedRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const currentUserId = await getCurrentUserId();

      /*
       * 1. Load local conversations first (only on the initial load — on
       *    later refetches we already have the server-ordered list on screen,
       *    and swapping in the cache order would visibly rearrange the list).
       */
      if (!hasLoadedRef.current) {
        try {
          const cache = await getConversations();

          if (cache.length) {
            setChats(cache);
            setLoading(false);
          }
        } catch {
          // Local cache unavailable.
        }
      }

      /*
       * 2. Get conversations from server
       */
      let serverConversations: Chat[] = [];
      try {
        const response = await api.get("/api/conversations");

        serverConversations = Array.isArray(response.data)
          ? response.data
              .map(normalizeChat)
              .filter((chat): chat is Chat => chat !== null)
          : [];
      } catch (err) {
        // Backend unreachable (bad LAN, phone asleep, tunnel down…). Keep
        // whatever is on screen (server list from a previous fetch or the
        // local cache) instead of wiping it. Retries happen on the next focus
        // or connectivity event.
        console.warn(
          "useChats: server fetch failed — keeping current list:",
          err,
        );
        return;
      }

      await syncConversationsWithServer({
        serverConversations,
      });

      try {
        const response = await api.get("/api/user/blocks");

        const blockedUserIdsServer = Array.isArray(response.data)
          ? response.data.map((block) => block.blockedId)
          : [];

        await syncBlockedUsers(blockedUserIdsServer);
      } catch (err) {
        console.warn("useChats: failed to sync blocked users:", err);
      }

      const fetched: Chat[] = dedupe(serverConversations);

      const decryptedChats: Chat[] = await Promise.all(
        fetched.map(async (chat) => {
          if (!chat.lastMessage) {
            return chat;
          }

          if (!chat.lastMessage.nonce) {
            return chat;
          }

          try {
            const memberIds = [
              currentUserId,
              ...chat.members.map((member) => member.id),
            ].filter((id): id is number => id !== null && id !== undefined);

            const conversationKey = await getOrCreateConversationKey(
              String(chat.id),
              memberIds,
            );

            // Key exists but this device can't decrypt it (no private key yet).
            // Show a placeholder — regenerating is handled inside crypto and
            // will NOT be done, so other devices keep their working key.
            const decrypted = conversationKey
              ? await decryptMessage({
                  encryptedMessage: chat.lastMessage.text,
                  nonce: chat.lastMessage.nonce,
                  decryptedConversationKey: conversationKey,
                })
              : { decryptMessage: "[Encrypted Message]" };

            return {
              ...chat,
              lastMessage: {
                ...chat.lastMessage,
                text: decrypted.decryptMessage,
              },
            };
          } catch {
            return {
              ...chat,
              lastMessage: {
                ...chat.lastMessage,
                text: "[Encrypted Message]",
              },
            };
          }
        }),
      );

      /*
       * 3. Show server conversations with decrypted preview text
       */
      setChats(decryptedChats);

      /*
       * 3b. Seed shared presence from the members' lastSeen (already-online
       *     users don't emit a socket presence event after we connect).
       *     lastSeen === null -> online; a timestamp -> offline (store
       *     defaults to offline, so only null needs to seed).
       */
      for (const chat of decryptedChats) {
        for (const member of chat.members) {
          if (member.lastSeen !== undefined) {
            reportPresence(member.id, member.lastSeen);
          }
        }
      }

      /*
       * 4. Join their socket rooms
       */
      joinConversations(decryptedChats.map((chat) => chat.id));

      /*
       * 5. Save decrypted previews locally
       */
      for (const chat of decryptedChats) {
        const otherMember = chat.members.find(
          (member) => member.id !== currentUserId,
        );

        if (!otherMember) {
          continue;
        }

        await saveConversation({
          id: chat.id,
          otherUserId: otherMember.id,
          otherUsername: otherMember.username ?? "Unknown",
          otherAvatarUrl: otherMember.avatar ?? "",
          lastMessageText: chat.lastMessage?.text ?? "",
          lastMessageSentAt: chat.lastMessage?.sentAt ?? "",
        }).catch(() => {});
      }
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        refetch();
      }
    });

    return unsubscribe;
  }, []);
  /*
   * New messages
   */
  useEffect(() => {
    const unsubscribe = listenForNewMessages(async (message) => {
      try {
        const currentUserId = await getCurrentUserId();

        // Only bump the badge for chats the user is NOT currently viewing —
        // the open chat's read state is handled by MessageList's mark-read.
        if (getActiveConversation() !== Number(message.conversationId)) {
          setChats((currentChats) =>
            currentChats.map((chat) =>
              chat.id === Number(message.conversationId)
                ? {
                    ...chat,
                    unread: (chat.unread ?? 0) + 1,
                  }
                : chat,
            ),
          );
        }

        const chat = chatsRef.current.find(
          (c) => c.id === Number(message.conversationId),
        );

        if (!chat) return;

        const memberIds = [
          currentUserId,
          ...chat.members.map((member) => member.id),
        ].filter((id): id is number => id !== null);

        const conversationKey = await getOrCreateConversationKey(
          String(message.conversationId),
          memberIds,
        );

        const decrypted = conversationKey
          ? await decryptMessage({
              encryptedMessage: message.text,
              nonce: message.nonce,
              decryptedConversationKey: conversationKey,
            })
          : { decryptMessage: "[Encrypted Message]" };

        const decryptedText = decrypted.decryptMessage;

        setChats((currentChats) => {
          const currentChat = currentChats.find(
            (c) => c.id === Number(message.conversationId),
          );

          if (!currentChat) return currentChats;

          const updatedChat: Chat = {
            ...currentChat,
            lastMessage: {
              id: Number(message.id),
              text: decryptedText,
              nonce: message.nonce,
              sentAt: message.sentAt,
              senderId: Number(message.senderId),
            },
          };

          const otherChats = currentChats.filter(
            (c) => c.id !== currentChat.id,
          );

          return [updatedChat, ...otherChats];
        });

        const otherMember = chat.members.find(
          (user) => user.id !== currentUserId,
        );

        if (!otherMember) {
          return;
        }

        await saveConversation({
          id: Number(message.conversationId),
          otherUserId: otherMember.id,
          otherUsername: otherMember.username,
          otherAvatarUrl: otherMember.avatar ?? "",
          lastMessageText: decryptedText,
          lastMessageSentAt: message.sentAt,
        });
      } catch (error) {
        console.error("Failed to decrypt new message preview:", error);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  // listen for group delete
  useEffect(() => {
    const unsubscribe = listenForGroupDelete(async ({ conversationId }) => {
      try {
        await deleteConversation({ conversationId: conversationId });
        setChats((currentChats) =>
          currentChats.filter((chat) => chat.id !== Number(conversationId)),
        );
      } catch (error) {
        console.error("Failed to decrypt new message preview:", error);
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const clearChat = async (conversationId: number) => {
    try {
      await clearChatOnServer(conversationId);
      Toast.show({
        type: "success",
        text1: "Chat cleared successfully",
      });
    } catch (error: any) {
      Toast.show({
        type: "error",
        text1: "Could not clear chat. Please try again later",
        text2: error.response?.data?.error ?? "Something went wrong",
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onChatCleared(({ conversationId }) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === conversationId
            ? { ...chat, lastMessage: undefined }
            : chat,
        ),
      );
    });
    return unsubscribe;
  }, []);

  const markChatAsReadLocally = useCallback((conversationId: number) => {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id === conversationId ? { ...chat, unread: 0 } : chat,
      ),
    );
  }, []);

  return {
    chats,
    clearChat,
    loading,
    markChatAsReadLocally,
    refetch,
  };
}

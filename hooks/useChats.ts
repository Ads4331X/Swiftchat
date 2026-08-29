import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { listenForNewMessages, joinConversations } from "@/lib/socket";
import {
  getConversations,
  saveConversation,
  syncConversationsWithServer,
} from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { decryptMessage, getOrCreateConversationKey } from "@/lib/crypto";
import NetInfo from "@react-native-community/netinfo";

export type ChatMember = {
  id: number;
  username: string;
  avatar?: string;
};

export type Chat = {
  id: number;
  members: ChatMember[];
  lastMessage?: {
    id: number;
    text: string;
    nonce?: string;
    sentAt: string;
    senderId: number;
  } | null;
};

function dedupe(chats: Chat[]): Chat[] {
  const seen = new Set<string>();

  return chats.filter((chat) => {
    const key = chat.members
      .map((m) => m.id)
      .sort((a, b) => a - b)
      .join(",");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

export default function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const refetch = useCallback(async () => {
    if (chatsRef.current.length === 0) {
      setLoading(true);
    }

    try {
      const currentUserId = await getCurrentUserId();

      /*
       * 1. Load local conversations first
       */
      try {
        const cache = await getConversations();

        if (cache.length) {
          setChats(cache);
          setLoading(false);
        }
      } catch {
        // Local cache unavailable.
      }

      /*
       * 2. Get conversations from server
       */
      const response = await api.get("/api/conversations");
      await syncConversationsWithServer({
        serverConversations: response.data,
      });

      const fetched: Chat[] = dedupe(response.data);

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

            const decrypted = await decryptMessage({
              encryptedMessage: chat.lastMessage.text,
              nonce: chat.lastMessage.nonce,
              decryptedConversationKey: conversationKey,
            });

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

        setChats((currentChats) => {
          const chat = currentChats.find(
            (c) => c.id === Number(message.conversationId),
          );

          if (!chat) {
            return currentChats;
          }

          return currentChats;
        });

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

        const decrypted = await decryptMessage({
          encryptedMessage: message.text,
          nonce: message.nonce,
          decryptedConversationKey: conversationKey,
        });

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

  /*
   * Fetch conversations
   */

  return {
    chats,
    loading,
    refetch,
  };
}

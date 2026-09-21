import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getCurrentUserId } from "@/lib/auth";
import { getConversationOtherUser, upsertUser } from "@/lib/db";
import { api } from "@/lib/api";
import { getOrCreateConversationKey } from "@/lib/crypto";
import { listenForPresence } from "@/lib/socket";
import { reportPresence } from "@/constants/presence-provider";

type ChatParticipant = {
  userId: number;
  username: string;
  avatarUrl?: string;
  lastSeen?: string | null;
};

type ChatMember = {
  id: number;
  username: string;
  avatar?: string;
};

export default function useChatParticipant(
  conversationId: string,
  memberIds: string | undefined,
  keyReadyVersion: number,
  setUpKeys: () => Promise<boolean>,
) {
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [conversationKey, setConversationKey] = useState<Uint8Array>();
  const [otherUser, setOtherUser] = useState<ChatParticipant | null>(null);
  const [conversationName, setConversationName] = useState<string | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadKey() {
      if (!conversationId || !memberIds) return;
      // Let key setup run (may show PIN modal) but don't let it block
      // loading the conversation key. The PIN is a backup feature and
      // never gates chatting.
      setUpKeys();

      try {
        const userId = await getCurrentUserId();
        const members = memberIds
          .split(",")
          .map(Number)
          .filter(Number.isFinite);
        const allMembers = Array.from(
          new Set(
            [userId, ...members].filter(
              (value): value is number => value != null,
            ),
          ),
        );
        const key = await getOrCreateConversationKey(
          conversationId,
          allMembers,
        );
        if (mounted) setConversationKey(key ?? undefined);
      } catch (error) {
        console.error("Failed to load conversation key:", error);
      }
    }

    loadKey();
    return () => {
      mounted = false;
    };
  }, [conversationId, memberIds, keyReadyVersion, setUpKeys]);

  useEffect(() => {
    if (otherUser?.userId != null) {
      reportPresence(otherUser.userId, otherUser.lastSeen);
    }
  }, [otherUser?.userId, otherUser?.lastSeen]);

  useEffect(() => {
    const cleanUp = listenForPresence(({ userId, lastSeen }) => {
      if (Number(userId) === Number(otherUser?.userId)) {
        setOtherUser((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            lastSeen,
          };
        });
      }
    });

    return cleanUp;
  }, [otherUser?.userId]);

  const loadParticipant = useCallback(async () => {
    if (!conversationId) return;

    const cached = await getConversationOtherUser(Number(conversationId));
    if (cached?.otherUsername) {
      try {
        const { data } = await api.get(`/api/user/${cached.otherUserId}`);

        setOtherUser({
          userId: cached.otherUserId,
          username: cached.otherUsername,
          avatarUrl: cached.otherAvatarUrl ?? undefined,
          lastSeen: data.lastSeen,
        });
      } catch {
        setOtherUser({
          userId: cached.otherUserId,
          username: cached.otherUsername,
          avatarUrl: cached.otherAvatarUrl ?? undefined,
        });
      }
    }

    try {
      const myId = await getCurrentUserId();
      const response = await api.get("/api/conversations");

      const conversations: any[] = response.data;
      const conversation = conversations.find(
        (item) =>
          String(item.conversationId ?? item.id) === String(conversationId),
      );
      const conversationMembers: any[] = conversation?.members ?? [];
      const member = conversationMembers.find((item: any) => item.id !== myId);
      setConversationName(
        typeof conversation?.name === "string" ? conversation.name : null,
      );
      // Group admins are the conversation creator (matches the server's
      // checkAdmin). Everyone else may not pin messages.
      setIsAdmin(
        myId != null && conversation?.createdById != null
          ? Number(conversation.createdById) === myId
          : false,
      );
      if (!conversationMembers.length) {
        return;
      }

      const allMembers: ChatMember[] = conversationMembers.map((m: any) => ({
        id: m.id,
        username: m.username,
        avatar: m.avatar ?? m.avatarUrl ?? undefined,
      }));
      if (myId != null) {
        allMembers.push({ id: myId, username: "You" });
      }
      setMembers(allMembers);
      if (member) {
        const { data: userData } = await api.get(`/api/user/${member.id}`);

        const participant = {
          userId: member.id,
          username: member.username,
          avatarUrl: member.avatar ?? member.avatarUrl ?? undefined,
          lastSeen: userData.lastSeen,
        };

        setOtherUser(participant);

        await upsertUser(
          member.id,
          participant.username,
          participant.avatarUrl,
        );
      }
    } catch {
      // Cached participant data is still usable while offline.
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      loadParticipant();
    }, [loadParticipant]),
  );

  return {
    currentUserId,
    conversationKey,
    conversationName,
    otherUser,
    members,
    isAdmin,
  };
}

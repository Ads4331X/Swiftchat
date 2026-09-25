import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getCurrentUserId } from "@/lib/auth";
import { getConversationOtherUser, getUser, upsertUser } from "@/lib/db";
import { api } from "@/lib/api";
import { getOrCreateConversationKey } from "@/lib/crypto";
import { listenForPresence } from "@/lib/socket";
import { reportPresence } from "@/constants/presence-provider";

type ChatParticipant = {
  userId: number;
  username: string;
  avatarUrl?: string;
  lastSeen?: string | null;
  localAvatarUrlPath: string | null;
};

type ChatMember = {
  id: number;
  username: string;
  avatar?: string;
  localAvatarUrlPath: string | null;
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

      setUpKeys().catch(() => {});

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

        if (mounted) {
          setConversationKey(key ?? undefined);
        }
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

    try {
      // Load the cached 1-to-1 participant

      const cached = await getConversationOtherUser(Number(conversationId));

      const otherUser = cached?.otherUserId
        ? await getUser(Number(cached.otherUserId))
        : null;

      if (cached?.otherUsername) {
        try {
          const { data } = await api.get(`/api/user/${cached.otherUserId}`);

          setOtherUser({
            userId: cached.otherUserId,
            username: cached.otherUsername,
            avatarUrl: cached.otherAvatarUrl ?? undefined,
            lastSeen: data.lastSeen,
            localAvatarUrlPath: otherUser?.localAvatarUrlPath ?? null,
          });
        } catch {
          setOtherUser({
            userId: cached.otherUserId,
            username: cached.otherUsername,
            avatarUrl: cached.otherAvatarUrl ?? undefined,
            localAvatarUrlPath: otherUser?.localAvatarUrlPath ?? null,
          });
        }
      }

      // Load conversation

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

      // Group admins are the conversation creator.
      setIsAdmin(
        myId != null && conversation?.createdById != null
          ? Number(conversation.createdById) === myId
          : false,
      );

      if (!conversationMembers.length) {
        return;
      }

      // Load local avatar path for every member

      const allMembers: ChatMember[] = [];

      for (const m of conversationMembers) {
        const user = await getUser(Number(m.id));

        allMembers.push({
          id: Number(m.id),
          username: m.username,
          avatar: m.avatar ?? m.avatarUrl ?? undefined,
          localAvatarUrlPath: user?.localAvatarUrlPath ?? null,
        });
      }

      // Add current user
      if (myId != null) {
        const myUser = await getUser(myId);

        allMembers.push({
          id: myId,
          username: "You",
          avatar: myUser?.avatarUrl ?? undefined,
          localAvatarUrlPath: myUser?.localAvatarUrlPath ?? null,
        });
      }

      setMembers(allMembers);

      // Update 1-to-1 participant from API
      if (member) {
        const { data: userData } = await api.get(`/api/user/${member.id}`);

        const participant = {
          userId: member.id,
          username: member.username,
          avatarUrl: member.avatar ?? member.avatarUrl ?? undefined,
          lastSeen: userData.lastSeen,
          localAvatarUrlPath: null,
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

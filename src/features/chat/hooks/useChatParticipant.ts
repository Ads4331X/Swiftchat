import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { getCurrentUserId } from "@/features/auth/services";
import { getConversationOtherUser, getUser, upsertUser } from "@/core/db";
import { api } from "@/core/api";
import { getOrCreateConversationKey } from "@/core/crypto";
import {
  listenForKeyRotation,
  listenForPresence,
  listenForSocketEvent,
} from "@/core/socket";
import { reportPresence } from "@/shared/providers/presence-provider";

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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  const loadKey = useCallback(
    async (rotationMemberIds?: number[]) => {
      if (!conversationId) return false;

      const members =
        rotationMemberIds ??
        (memberIds ?? "")
          .split(",")
          .map(Number)
          .filter(Number.isFinite);

      if (members.length === 0) return false;

      setUpKeys().catch(() => {});

      try {
        const userId = await getCurrentUserId();

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

        if (key && mountedRef.current) {
          setConversationKey(key);
        }

        return Boolean(key);
      } catch (error) {
        console.error("Failed to load conversation key:", error);
        return false;
      }
    },
    [conversationId, memberIds, setUpKeys],
  );

  const refreshKey = useCallback(
    async (rotationMemberIds?: number[]) => {
      let refreshed = await loadKey(rotationMemberIds);

      for (let attempt = 0; !refreshed && attempt < 3; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 400));
        if (!mountedRef.current) return false;
        refreshed = await loadKey(rotationMemberIds);
      }

      return refreshed;
    },
    [loadKey],
  );

  useEffect(() => {
    void refreshKey();
  }, [refreshKey, keyReadyVersion]);

  useEffect(() => {
    if (!conversationId) return;

    const unsubscribeRotation = listenForKeyRotation((data) => {
      if (Number(data.conversationId) !== Number(conversationId)) return;

      const rotatedMemberIds = (data.memberIds ?? [])
        .map(Number)
        .filter(Number.isFinite);
      if (rotatedMemberIds.length === 0) return;

      void refreshKey(rotatedMemberIds);
    });

    const unsubscribeConnect = listenForSocketEvent("connect", () => {
      void (async () => {
        try {
          const response = await api.get("/api/conversations");
          const conversations: any[] = response.data;
          const conversation = conversations.find(
            (item) =>
              String(item.conversationId ?? item.id) === String(conversationId),
          );
          const freshMemberIds: number[] = (conversation?.members ?? [])
            .map((member: any) => Number(member.id ?? member.userId))
            .filter((value: number) => Number.isFinite(value));

          if (freshMemberIds.length > 0) {
            await refreshKey(freshMemberIds);
          }
        } catch {
          // Keep the existing key; the next reconnect/rotation will retry.
        }
      })();
    });

    return () => {
      unsubscribeRotation();
      unsubscribeConnect();
    };
  }, [conversationId, refreshKey]);

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

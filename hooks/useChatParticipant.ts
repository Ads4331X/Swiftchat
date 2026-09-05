import { useEffect, useState } from "react";
import { getCurrentUserId } from "@/lib/auth";
import { getConversationOtherUser, upsertUser } from "@/lib/db";
import { api } from "@/lib/api";
import { getOrCreateConversationKey } from "@/lib/crypto";

type ChatParticipant = {
  userId: number;
  username: string;
  avatarUrl?: string;
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
  const [members, setMembers] = useState<ChatMember[]>([]);

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
    if (!conversationId) return;
    let cancelled = false;

    async function loadParticipant() {
      const cached = await getConversationOtherUser(Number(conversationId));
      if (!cancelled && cached?.otherUsername) {
        setOtherUser({
          userId: cached.otherUserId,
          username: cached.otherUsername,
          avatarUrl: cached.otherAvatarUrl ?? undefined,
        });
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
        const member = conversationMembers.find(
          (item: any) => item.id !== myId,
        );
        if (!conversationMembers.length || cancelled) {
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

        if (member && !cancelled) {
          const participant = {
            userId: member.id,
            username: member.username,
            avatarUrl: member.avatar ?? member.avatarUrl ?? undefined,
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
    }

    loadParticipant();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return { currentUserId, conversationKey, otherUser, members };
}

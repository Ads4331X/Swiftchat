import { router } from "expo-router";
import { api } from "@/core/api";
import { getCurrentUserId } from "@/features/auth/services";
import { getConversationOtherUser } from "@/core/db";

// dismisses back to the conversation we sent from and scrolls to the new
// message, so the review/camera screens don't stay on the stack.
export async function openChatAfterSend(
  conversationId: number,
  messageId: number,
) {
  const currentUserId = await getCurrentUserId();
  const cached = await getConversationOtherUser(conversationId);

  // seed from the local cache, then refresh from the server (also covers groups)
  let username = cached?.otherUsername ?? "";
  let avatarUrl = cached?.otherAvatarUrl ?? "";
  let memberIds = cached?.otherUserId ? [cached.otherUserId] : [];

  try {
    const { data } = await api.get("/api/conversations");
    const conversations: any[] = Array.isArray(data) ? data : [];
    const conversation = conversations.find(
      (item) =>
        String(item.conversationId ?? item.id) === String(conversationId),
    );

    const members: any[] = conversation?.members ?? [];

    // memberIds excludes the current user, matching the chat list / [id] isGroup check
    const others = members
      .map((member) => Number(member.id))
      .filter((id) => Number.isFinite(id) && id !== currentUserId);

    if (others.length) {
      memberIds = others;

      const other = members.find((member) => Number(member.id) === others[0]);

      if (other) {
        username = other.username ?? username;
        avatarUrl = other.avatar ?? other.avatarUrl ?? avatarUrl;

        // the cached avatar can be null; pull the freshest value
        const { data: profile } = await api.get(`/api/user/${others[0]}`);
        username = profile?.username ?? username;
        avatarUrl = profile?.avatar ?? profile?.avatarUrl ?? avatarUrl;
      }
    }
  } catch {
    // fall back to the locally cached values
  }

  router.dismissTo({
    pathname: "/chat/[id]" as any as any,
    params: {
      id: String(conversationId),
      username,
      avatarUrl,
      memberIds: memberIds.join(","),
      messageId: String(messageId),
    },
  });
}

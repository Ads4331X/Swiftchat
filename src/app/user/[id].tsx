import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/core/api";
import { getCurrentUserId } from "@/features/auth/services";
import { BRAND_COLOR } from "@/shared/theme/theme";
import { useTheme } from "@/shared/providers/theme-provider";
import OtherProfileHeader from "@/features/profile/components/OtherProfileHeader";
import ProfileSettingsSection, {
  type ProfileRow,
} from "@/features/profile/components/ProfileSettingsSection";
import GroupMemberList, {
  type GroupMember,
} from "@/features/profile/components/GroupMemberList";
import { deleteConversation, getUser } from "@/core/db";
import { clearChat } from "@/features/chat/services/sync";
import { formatPresence } from "@/shared/utils/formatPresence";
import { listenForPresence } from "@/core/socket";
import { reportPresence } from "@/shared/providers/presence-provider";
import { useBlockedUsers } from "@/features/security/hooks/useBlockedUsers";
import { useCall } from "@/features/calls/use-call";

type User = {
  id: number;
  avatar?: string;
  username: string;
  lastSeen: string | null;
};

export default function OtherProfile() {
  const { id, username, memberIds, chatId } = useLocalSearchParams<{
    id: string;
    username?: string;
    memberIds?: string;
    chatId?: string;
  }>();

  const router = useRouter();
  const { colors } = useTheme();
  const { startCall } = useCall();
  const [user, setUser] = useState<User>();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [myId, setMyId] = useState<number>();
  const [myName, setMyName] = useState("");
  const [myAvatar, setMyAvatar] = useState("");
  const [myLocalAvatar, setMyLocalAvatar] = useState<string | null>(null);
  const [otherLocalAvatar, setOtherLocalAvatar] = useState<string | null>(null);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminId, setAdminId] = useState<number | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");
  const { blockedIds, addBlockUserId, removeBlockUserId } = useBlockedUsers();
  const isBlocked = user ? blockedIds.includes(user.id) : false;

  const otherMemberIds = (memberIds ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
  const isGroup = otherMemberIds.length > 1;
  const memberCount =
    members.length > 0
      ? myId == null
        ? members.length
        : members.length + 1
      : otherMemberIds.length + 1;
  const memberList =
    myId == null
      ? members
      : [
          ...members.filter((m) => m.id !== myId),
          {
            id: myId,
            username: `You (${myName})`,
            avatar: myAvatar,
            localAvatarUrlPath: myLocalAvatar,
          },
        ];

  useEffect(() => {
    if (!isGroup && id != null) {
      reportPresence(Number(id), user?.lastSeen);
    }
  }, [id, isGroup, user?.lastSeen]);

  useEffect(() => {
    const cleanup = listenForPresence(({ userId, lastSeen }) => {
      if (Number(userId) === Number(id)) {
        setUser((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            lastSeen,
          };
        });
      }
    });

    return cleanup;
  }, [id]);
  const getOtherProfile = useCallback(async () => {
    if (!id) return;

    if (isGroup) {
      const me = await getCurrentUserId();
      if (me != null) {
        setMyId(me);
        const meData = await api.get(`/api/user/${me}`).catch(() => null);
        setMyName(meData?.data?.username ?? "");
        setMyAvatar(meData?.data?.avatar ?? "");
        const local = await getUser(me);
        setMyLocalAvatar(local?.localAvatarUrlPath ?? null);
      }

      const { data } = await api.get("/api/conversations");
      const chat = data.find(
        (c: any) => String(c.conversationId ?? c.id) === String(id),
      );
      setIsAdmin(
        Boolean(chat) && me != null && Number(chat?.createdById) === me,
      );
      setAdminId(chat?.createdById ? Number(chat.createdById) : null);
      setGroupName(chat?.name?.trim() || null);
      const apiMembers = (chat?.members ?? []).map(async (m: any) => {
        const local = await getUser(Number(m.id));
        return {
          id: Number(m.id),
          username: m.username,
          avatar: m.avatar ?? m.avatarUrl ?? undefined,
          localAvatarUrlPath: local?.localAvatarUrlPath ?? null,
        };
      });
      setMembers(await Promise.all(apiMembers));
    } else {
      const { data } = await api.get(`/api/user/${id}`);

      setUser({
        id: data.id,
        avatar: data.avatar,
        username: data.username,
        lastSeen: data.lastSeen,
      });
      const local = await getUser(Number(id));
      setOtherLocalAvatar(local?.localAvatarUrlPath ?? null);
      if (chatId) {
        try {
          const { data: convs } = await api.get("/api/conversations");
          const chat = convs.find(
            (c: any) => String(c.conversationId ?? c.id) === String(chatId),
          );
          setGroupName(chat?.name?.trim() || null);
        } catch {}
      }
    }
  }, [id, isGroup, chatId]);

  useFocusEffect(
    useCallback(() => {
      getOtherProfile();
    }, [getOtherProfile]),
  );

  const handleRename = async () => {
    const trimmed = renameText.trim();
    if (!trimmed) return;
    try {
      await api.patch(`/api/conversations/${chatId ?? id}`, { name: trimmed });
      setGroupName(trimmed);
      setRenameVisible(false);
    } catch {
      Alert.alert("Rename failed", "Could not rename the conversation.");
    }
  };

  const handleStartCall = async (callType: "audio" | "video") => {
    if (isGroup || id == null) return;

    try {
      let conversationId = chatId ? Number(chatId) : NaN;

      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
        const targetUsername = user?.username;

        if (!targetUsername) {
          throw new Error("Could not resolve this contact.");
        }

        const response = await api.post(
          "/api/conversations/new-conversation",
          { targetUsername },
        );
        const conversation = (response.data as any)?.conversation;
        conversationId = Number(conversation?.id);
      }

      if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
        throw new Error("Could not open a conversation for this call.");
      }

      await startCall({
        callType,
        conversationId,
        participantId: Number(id),
        participantName: user?.username ?? username,
      });
    } catch (err) {
      Alert.alert(
        "Could not start call",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const muted = colors.text + "80";
  const faint = colors.text + "1f";

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: title, style: "destructive", onPress: onConfirm },
    ]);
  };

  const removeMember = (member: GroupMember) => {
    confirm(
      "Remove member",
      `Remove ${member.username} from the group?`,
      async () => {
        try {
          await api.delete(`/api/conversations/${id}/members/${member.id}`);
          setMembers((prev) => prev.filter((m) => m.id !== member.id));
        } catch (err: any) {
          Alert.alert(
            "Couldn't remove member",
            err.response?.data?.error ?? "Something went wrong",
          );
        }
      },
    );
  };

  const mediaRows: ProfileRow[] = [
    {
      key: "media",
      icon: "image",
      label: "Media, links & docs",
      trailing: "128",
      onPress: () => console.log("Open media, links, and docs"),
    },
    {
      key: "storage",
      icon: "hard-drive",
      label: "Manage storage",
      trailing: "1.2 GB",
      onPress: () => console.log("Open manage storage"),
    },
  ];

  const notificationRows: ProfileRow[] = [
    {
      key: "notifications",
      icon: "bell",
      label: "Notifications",
      control: (
        <Switch
          value={notificationsOn}
          onValueChange={setNotificationsOn}
          trackColor={{ false: faint, true: BRAND_COLOR }}
          thumbColor="#fff"
        />
      ),
    },
  ];

  const privacyRows: ProfileRow[] = [
    {
      key: "encryption",
      icon: "lock",
      label: "Encryption",
      trailing: "End-to-end encrypted",
    },
  ];

  const addMemberRow: ProfileRow = {
    key: "add-members",
    icon: "user-plus",
    label: "Add members to chat",
    onPress: () =>
      router.push({
        pathname: "/group/[id]/add-members" as any,
        params: { id: chatId ?? id, memberIds },
      }),
  };

  const sharedRows: ProfileRow[] = [
    addMemberRow,
    {
      key: "groups",
      icon: "users",
      label: "Groups in common",
      trailing: "3",
      onPress: () => console.log("Open groups in common"),
    },
  ];

  const dangerRows: ProfileRow[] = isGroup
    ? [
        {
          key: "clear-chat",
          icon: "x-circle",
          label: "Clear chat",
          destructive: true,
          onPress: () =>
            confirm(
              "Clear chat",
              "This will clear the chat history for this group.",
              async () => {
                const conversationId = Number(chatId ?? id);
                if (!conversationId) return;
                try {
                  await clearChat(conversationId);
                  Alert.alert(
                    "Chat cleared",
                    "Chat history cleared successfully.",
                  );
                } catch (err: any) {
                  Alert.alert(
                    "Couldn't clear chat",
                    (err?.response?.data?.error as string) ??
                      "Something went wrong. Please try again.",
                  );
                }
              },
            ),
        },
        {
          key: "leave-group",
          icon: "user-x",
          label: "Leave group",
          destructive: true,
          onPress: () =>
            confirm(
              "Leave group",
              "You won't receive messages from this group anymore.",
              async () => {
                try {
                  await api.delete(`/api/conversations/${id}/leave`);
                  router.replace("/chat" as any);
                } catch (err: any) {
                  Alert.alert(
                    "Couldn't leave group",
                    err.response?.data?.error ?? "Something went wrong",
                  );
                }
              },
            ),
        },
        {
          key: "delete-group",
          icon: "x-circle",
          label: "Delete Group",
          destructive: true,
          disabled: !isAdmin,
          onPress: () => {
            if (!isAdmin) {
              Alert.alert(
                "Only admins can delete the group",
                "You don't have permission to delete this group. Only the group admin can delete it.",
              );
              return;
            }
            confirm(
              "Delete Group",
              "This will permanently remove the group and all messages for everyone. This can't be undone.",
              async () => {
                try {
                  await api.delete(`/api/conversations/${id}`);
                  await deleteConversation({ conversationId: Number(id) });
                  router.replace("/chat" as any);
                } catch (err: any) {
                  const isForbidden =
                    err?.status === 403 ||
                    err?.response?.status === 403 ||
                    (err?.response?.data &&
                      /admin|permission|forbidden/i.test(
                        JSON.stringify(err.response.data),
                      ));
                  Alert.alert(
                    "Couldn't delete group",
                    isForbidden
                      ? "Only the group admin can delete this group."
                      : (err.response?.data?.error ??
                          "Something went wrong. Please try again."),
                  );
                }
              },
            );
          },
        },
      ]
    : [
        {
          key: "delete",
          icon: "x-circle",
          label: "Clear chat",
          destructive: true,
          onPress: () =>
            confirm(
              "Clear chat",
              "This will clear the chat history with this contact.",
              async () => {
                const conversationId = Number(chatId);
                if (!conversationId) return;
                try {
                  await clearChat(conversationId);
                  Alert.alert(
                    "Chat cleared",
                    "Chat history cleared successfully.",
                  );
                } catch (err: any) {
                  Alert.alert(
                    "Couldn't clear chat",
                    (err?.response?.data?.error as string) ??
                      "Something went wrong. Please try again.",
                  );
                }
              },
            ),
        },
        {
          key: "block",
          icon: "slash",
          label: isBlocked
            ? `Unblock ${user?.username ?? "contact"}`
            : `Block ${user?.username ?? "contact"}`,
          destructive: !isBlocked,
          onPress: () =>
            confirm(
              isBlocked ? "Unblock contact" : "Block contact",
              isBlocked
                ? `You will be able to receive messages from ${
                    user?.username ?? "this contact"
                  } again.`
                : `You won't receive messages or calls from ${
                    user?.username ?? "this contact"
                  } anymore.`,
              async () => {
                try {
                  if (isBlocked) {
                    await api.delete("/api/user/block", {
                      data: {
                        userId: user!.id,
                      },
                    });

                    await removeBlockUserId(user!.id);
                  } else {
                    await api.post("/api/user/block", {
                      userId: user!.id,
                    });

                    await addBlockUserId(user!.id);
                  }
                } catch (err) {
                  console.warn("Failed to update block:", err);
                }
              },
            ),
        },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        <OtherProfileHeader
          isGroup={isGroup}
          username={
            isGroup
              ? (groupName ?? username ?? "Group")
              : (groupName ?? username ?? user?.username ?? "Unknown user")
          }
          avatar={isGroup ? undefined : user?.avatar}
          userId={isGroup ? undefined : Number(id)}
          subtitle={isGroup || !groupName ? undefined : user?.username}
          presence={
            isGroup ? `${memberCount} members` : formatPresence(user?.lastSeen)
          }
          isOnline={!isGroup && user?.lastSeen === null}
          textColor={colors.text}
          mutedColor={muted}
          localAvatarUrlPath={isGroup ? null : otherLocalAvatar}
          onEditName={
            isGroup
              ? isAdmin
                ? () => {
                    setRenameText(groupName ?? "");
                    setRenameVisible(true);
                  }
                : undefined
              : chatId
                ? () => {
                    setRenameText(groupName ?? "");
                    setRenameVisible(true);
                  }
                : undefined
          }
          onVideoCall={() => void handleStartCall("video")}
          onAudioCall={() => void handleStartCall("audio")}
          onSearch={() => {
            router.push({
              pathname: "/user/search" as any,
              params: {
                conversationId: String(chatId),
              },
            });
            console.log("Search in chat");
          }}
        />
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: faint,
            marginTop: 20,
          }}
        />
        {isGroup && (
          <GroupMemberList
            members={memberList}
            memberCount={memberCount}
            myId={myId}
            myName={myName}
            adminId={adminId}
            canRemove={isAdmin}
            showAll={showAllMembers}
            onToggleShowAll={() => setShowAllMembers((v) => !v)}
            onOpen={(memberId) =>
              router.push({
                pathname: "/user/[id]" as any,
                params: { id: memberId },
              })
            }
            onRemove={removeMember}
          />
        )}
        <ProfileSettingsSection title="Media" rows={mediaRows} />
        <ProfileSettingsSection title="Notifications" rows={notificationRows} />
        <ProfileSettingsSection title="Privacy" rows={privacyRows} />
        <ProfileSettingsSection title="Shared" rows={sharedRows} />
        <ProfileSettingsSection title="Danger zone" rows={dangerRows} />
      </ScrollView>

      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => setRenameVisible(false)}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.background,
              borderRadius: 14,
              padding: 20,
              width: "85%",
            }}
          >
            <Text
              style={{ color: colors.text }}
              className="text-[17px] font-semibold mb-3"
            >
              Rename chat
            </Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder={isGroup ? "Group name" : "Nickname"}
              placeholderTextColor={muted}
              autoFocus
              style={{
                color: colors.text,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.text + "40",
                borderRadius: 10,
                padding: 12,
                fontSize: 16,
              }}
            />
            <View className="flex-row justify-end gap-4 mt-4">
              <Pressable onPress={() => setRenameVisible(false)}>
                <Text style={{ color: muted }} className="text-[15px]">
                  Cancel
                </Text>
              </Pressable>
              <Pressable onPress={handleRename} disabled={!renameText.trim()}>
                <Text
                  style={{
                    color: renameText.trim() ? BRAND_COLOR : muted,
                  }}
                  className="text-[15px] font-semibold"
                >
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

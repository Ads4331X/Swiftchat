import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import BottomSheet from "@gorhom/bottom-sheet";
import Feather from "@expo/vector-icons/Feather";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";
import Avatar from "@/components/profile/Avatar";
import OtherProfileHeader from "@/components/profile/OtherProfileHeader";
import ProfileSettingsSection, {
  type ProfileRow,
} from "@/components/profile/ProfileSettingsSection";
import NewChatSheet from "@/components/chat/new-chat/NewChatSheet";

type User = {
  avatar?: string;
  username: string;
  lastSeen?: string;
};

type GroupMember = {
  id: number;
  username: string;
  avatar?: string;
};

const MAX_MEMBERS = 5;

function formatPresence(lastSeen?: string) {
  if (!lastSeen) return "Offline";

  const lastSeenDate = new Date(lastSeen);
  if (Number.isNaN(lastSeenDate.getTime())) return "Offline";
  if (Date.now() - lastSeenDate.getTime() < 2 * 60 * 1000) return "Online";

  return `Last online ${lastSeenDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} at ${lastSeenDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function OtherProfile() {
  const { id, username, memberIds } = useLocalSearchParams<{
    id: string;
    username?: string;
    memberIds?: string;
  }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [user, setUser] = useState<User>();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [myId, setMyId] = useState<number>();
  const [myName, setMyName] = useState("");
  const [myAvatar, setMyAvatar] = useState("");
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const otherMemberIds = (memberIds ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
  const isGroup = otherMemberIds.length > 1;
  const memberCount = otherMemberIds.length + 1;
  const memberList =
    myId == null
      ? members
      : [
          ...members.filter((m) => m.id !== myId),
          { id: myId, username: `You (${myName})`, avatar: myAvatar },
        ];
  const visibleMembers = showAllMembers
    ? memberList
    : memberList.slice(0, MAX_MEMBERS);

  useEffect(() => {
    async function getOtherProfile() {
      if (!id) return;

      if (isGroup) {
        const me = await getCurrentUserId();
        if (me != null) {
          setMyId(me);
          const meData = await api.get(`/api/user/${me}`).catch(() => null);
          setMyName(meData?.data?.username ?? "");
          setMyAvatar(meData?.data?.avatar ?? "");
        }

        const { data } = await api.get("/api/conversations");
        const chat = data.find(
          (c: any) => String(c.conversationId ?? c.id) === String(id),
        );
        setIsAdmin(Boolean(chat?.isCurrentUserAdmin));
        setMembers(
          (chat?.members ?? []).map((m: any) => ({
            id: Number(m.id),
            username: m.username,
            avatar: m.avatar ?? m.avatarUrl ?? undefined,
          })),
        );
      } else {
        const { data } = await api.get(`/api/user/${id}`);
        setUser({
          avatar: data.avatar,
          username: data.username,
          lastSeen: data.lastSeen,
        });
      }
    }

    getOtherProfile();
  }, [id, isGroup]);

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
    confirm("Remove member", `Remove ${member.username} from the group?`, () =>
      setMembers((prev) => prev.filter((m) => m.id !== member.id)),
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

  const sharedRows: ProfileRow[] = [
    {
      key: "add-members",
      icon: "user-plus",
      label: "Add members to chat",
      onPress: () => bottomSheetRef.current?.expand(),
    },
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
          key: "leave-group",
          icon: "user-x",
          label: "Leave group",
          destructive: true,
          onPress: () =>
            confirm(
              "Leave group",
              "You won't receive messages from this group anymore.",
              () => {
                const result = api.delete(`/api/conversations/${id}/leave`);
                console.log("Left group", result);
              },
            ),
        },
      ]
    : [
        {
          key: "delete",
          icon: "x-circle",
          label: "Delete chat",
          destructive: true,
          onPress: () =>
            confirm(
              "Delete chat",
              "This will remove the conversation from your chat list.",
              () => console.log("Chat deleted"),
            ),
        },
        {
          key: "block",
          icon: "slash",
          label: `Block ${user?.username ?? "contact"}`,
          destructive: true,
          onPress: () =>
            confirm(
              "Block contact",
              `You won't receive messages or calls from ${
                user?.username ?? "this contact"
              } anymore.`,
              () => console.log("Contact blocked"),
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
          username={isGroup ? (username ?? "Group") : user?.username}
          avatar={isGroup ? undefined : user?.avatar}
          presence={
            isGroup ? `${memberCount} members` : formatPresence(user?.lastSeen)
          }
          textColor={colors.text}
          mutedColor={muted}
          onVideoCall={() => console.log("Video call")}
          onAudioCall={() => console.log("Audio call")}
          onSearch={() => console.log("Search in chat")}
        />
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: faint,
            marginTop: 20,
          }}
        />
        {isGroup && (
          <View className="mt-7">
            <Text
              style={{ color: BRAND_COLOR + "cc" }}
              className="text-xs font-semibold uppercase tracking-wide px-5 mb-1.5"
            >
              Members ({memberCount})
            </Text>
            {visibleMembers.map((member) => (
              <View key={member.id} className="flex-row items-center px-5 py-2">
                <Pressable
                  disabled={member.id === myId}
                  onPress={() => {
                    if (member.id !== myId) {
                      router.push({
                        pathname: "/otherProfile/[id]",
                        params: { id: member.id },
                      });
                    }
                  }}
                  className="flex-1 flex-row items-center py-1"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? faint : "transparent",
                  })}
                >
                  <Avatar
                    username={member.id === myId ? myName : member.username}
                    avatarUrl={member.avatar}
                    size={40}
                  />
                  <Text
                    style={{ color: colors.text }}
                    className="flex-1 text-[15px] ml-4"
                  >
                    {member.username}
                  </Text>
                </Pressable>
                {isAdmin && member.id !== myId && (
                  <Pressable
                    onPress={() => removeMember(member)}
                    hitSlop={10}
                    className="p-2"
                  >
                    <Feather name="user-minus" size={18} color="#E5484D" />
                  </Pressable>
                )}
              </View>
            ))}
            {memberList.length > MAX_MEMBERS && (
              <Pressable
                onPress={() => setShowAllMembers((v) => !v)}
                className="flex-row items-center px-5 py-3"
                style={({ pressed }) => ({
                  backgroundColor: pressed ? faint : "transparent",
                })}
              >
                <Text
                  style={{ color: BRAND_COLOR }}
                  className="text-[15px] font-medium"
                >
                  {showAllMembers
                    ? "Show less"
                    : `See all ${memberCount} members`}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <ProfileSettingsSection title="Media" rows={mediaRows} />
        <ProfileSettingsSection title="Notifications" rows={notificationRows} />
        <ProfileSettingsSection title="Privacy" rows={privacyRows} />
        <ProfileSettingsSection title="Shared" rows={sharedRows} />
        <ProfileSettingsSection title="Danger zone" rows={dangerRows} />
      </ScrollView>
      <NewChatSheet bottomSheetRef={bottomSheetRef} variant="add-member" />
    </View>
  );
}

import { Alert, ScrollView, StyleSheet, Switch, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import BottomSheet from "@gorhom/bottom-sheet";
import { api } from "@/lib/api";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";
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
  const { id: userId } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [user, setUser] = useState<User>();
  const [notificationsOn, setNotificationsOn] = useState(true);
  const bottomSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    async function getOtherProfile() {
      if (!userId) return;

      const response = await api.get(`/api/user/${userId}`);
      setUser({
        avatar: response.data.avatar,
        username: response.data.username,
        lastSeen: response.data.lastSeen,
      });
    }

    getOtherProfile();
  }, [userId]);

  const muted = colors.text + "80";
  const faint = colors.text + "1f";

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: title, style: "destructive", onPress: onConfirm },
    ]);
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

  const dangerRows: ProfileRow[] = [
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
          username={user?.username}
          avatar={user?.avatar}
          presence={formatPresence(user?.lastSeen)}
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

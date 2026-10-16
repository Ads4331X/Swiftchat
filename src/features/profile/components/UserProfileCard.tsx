import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";
import Avatar from "@/features/profile/components/Avatar";
import { Ionicons } from "@expo/vector-icons";

type UserProfileCardProps = {
  username: string;
  subtitle?: string;
  avatarUrl?: string;
  localAvatarUrlPath: string | null;
  onPressAvatar?: () => void;
};

export default function UserProfileCard({
  username,
  subtitle,
  localAvatarUrlPath,
  avatarUrl,
  onPressAvatar,
}: UserProfileCardProps) {
  const { colors, subtleText } = useTheme();

  return (
    <View className="items-center px-4 py-8">
      <Pressable className="relative" onPress={onPressAvatar}>
        <Avatar
          username={username}
          avatarUrl={avatarUrl}
          size={80}
          localAvatarUrlPath={localAvatarUrlPath}
        />

        <View
          className="absolute bottom-0 right-0 items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            backgroundColor: colors.background,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.15,
            shadowRadius: 3,
            elevation: 3, // Android shadow
          }}
        >
          <Ionicons name="camera" size={14} color={colors.icon} />
        </View>
      </Pressable>

      <Text
        style={{ color: colors.text }}
        className="mt-3 text-xl font-bold text-center"
      >
        {username}
      </Text>
      {subtitle ? (
        <Text style={{ color: subtleText }} className="mt-1 text-center">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

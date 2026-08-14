import { Text, View } from "react-native";
import { useTheme } from "@/constants/theme-provider";
import Avatar from "./Avatar";

type UserProfileCardProps = {
  username: string;
  subtitle?: string;
  avatarUrl?: string;
};

export default function UserProfileCard({
  username,
  subtitle,
  avatarUrl,
}: UserProfileCardProps) {
  const { colors, subtleText } = useTheme();

  return (
    <View className="items-center px-4 py-8">
      <Avatar username={username} avatarUrl={avatarUrl} size={80} />
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

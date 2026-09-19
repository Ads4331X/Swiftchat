import { Image, Text, View } from "react-native";
import { BRAND_COLOR } from "@/constants/theme";

type AvatarProps = {
  username: string;
  avatarUrl?: string;
  size?: number;
  userId?: number;
};

export default function Avatar({
  username,
  avatarUrl,
  size = 48,
  userId,
}: AvatarProps) {
  const initial = username.charAt(0).toUpperCase() || "?";

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: BRAND_COLOR,
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "bold" }}>
        {initial}
      </Text>
    </View>
  );
}

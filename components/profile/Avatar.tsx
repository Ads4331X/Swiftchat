import { Image, Text, View } from "react-native";
import { BRAND_COLOR } from "@/constants/theme";
import { usePresence } from "@/constants/presence-provider";

type AvatarProps = {
  username: string;
  avatarUrl?: string;
  size?: number;
  userId?: number;
  isOnline?: boolean;
  ringColor?: string;
  localAvatarUrlPath: string | null;
};

const DOT_SIZE = 11;

export default function Avatar({
  username,
  avatarUrl,
  size = 48,
  userId,
  isOnline = false,
  ringColor = "#fff",
  localAvatarUrlPath = null,
}: AvatarProps) {
  const onlineFromStore = usePresence(userId);
  const initial = username.charAt(0).toUpperCase() || "?";
  const online = userId != null ? onlineFromStore || isOnline : isOnline;

  return (
    <View style={{ width: size, height: size, position: "relative" }}>
      {localAvatarUrlPath ? (
        <Image
          source={{ uri: localAvatarUrlPath }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
        />
      ) : (
        <View
          className="items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: BRAND_COLOR,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: size * 0.4,
              fontWeight: "bold",
            }}
          >
            {initial}
          </Text>
        </View>
      )}

      {online && (
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: DOT_SIZE / 2,
            backgroundColor: "#22C55E",
            borderWidth: 2,
            borderColor: ringColor,
          }}
        />
      )}
    </View>
  );
}

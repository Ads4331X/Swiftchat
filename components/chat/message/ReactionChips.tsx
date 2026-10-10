import { Text, View } from "react-native";
import { type MessageReaction } from "@/hooks/useChatMessages";
import { useTheme } from "@/constants/theme-provider";
import { groupReactions } from "./utils";

export function ReactionChips({
  reactions,
  isMine,
}: {
  reactions?: MessageReaction[];
  isMine: boolean;
}) {
  const { isDark } = useTheme();
  const grouped = groupReactions(reactions);
  if (grouped.length === 0) return null;

  const chipBg = isMine
    ? isDark
      ? "rgba(255,255,255,0.18)"
      : "#2F3437"
    : isDark
      ? "#3A3D40"
      : "#FFFFFF";

  const chipBorder = isMine
    ? isDark
      ? "rgba(255,255,255,0.25)"
      : "transparent"
    : isDark
      ? "rgba(255,255,255,0.08)"
      : "#D9DEE3";

  const countColor = isMine ? "#fff" : isDark ? "#ECEDEE" : "#11181C";

  return (
    <View
      style={{
        position: "absolute",
        bottom: -11,
        [isMine ? "right" : "left"]: 0,
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 3,
        maxWidth: "70%",
      }}
    >
      {grouped.map(({ emoji, count }) => (
        <View
          key={emoji}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 3,
            paddingHorizontal: 7,
            height: 22,
            borderRadius: 11,
            backgroundColor: chipBg,
            borderWidth: 1,
            borderColor: chipBorder,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 13 }}>{emoji}</Text>
          {count > 1 && (
            <Text
              style={{ fontSize: 12, color: countColor, fontWeight: "600" }}
            >
              {count}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

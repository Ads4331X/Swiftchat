import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { type RepliedTo } from "@/features/chat/hooks/useChatMessages";
import { BRAND_COLOR } from "@/shared/theme/theme";
import { useTheme } from "@/shared/providers/theme-provider";
import { useRef } from "react";
import { accentForSender } from "@/features/chat/components/message/utils";

export function RepliedToQuote({
  repliedTo,
  replyToId,
  isMine,
  isGroup,
  onQuotePress,
}: {
  repliedTo: RepliedTo;
  replyToId?: number;
  isMine: boolean;
  isGroup?: boolean;
  onQuotePress?: (messageId: number) => void;
}) {
  const { isDark, subtleText } = useTheme();
  const isDeleted = !repliedTo.text || /message deleted/i.test(repliedTo.text);
  // Deleted originals are NOT pressable — there's nowhere to jump.
  const canPress = !isDeleted && replyToId != null;

  // Press feedback: instant scale-down + an extra depress wash while held,
  // then a tiny spring bounce back with the wash fading quickly on release.
  const scale = useRef(new Animated.Value(1)).current;
  const wash = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    if (!canPress) return;
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 0.97,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.timing(wash, {
        toValue: 1,
        duration: 60,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    if (!canPress) return;
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 25,
        bounciness: 7,
      }),
      Animated.timing(wash, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = () => {
    if (canPress && replyToId != null) onQuotePress?.(replyToId);
  };

  const accentColor = isMine
    ? "rgba(255,255,255,0.85)"
    : isGroup
      ? accentForSender(repliedTo.senderName)
      : BRAND_COLOR;

  // Reply card background — matches its matching message bubble's color family:
  // a darker teal-green for own bubbles (WhatsApp-style), a deeper shade of
  // the neutral gray for incoming ones. Stays distinct from the teal/gray
  // message bubble below.
  const replyBg = isMine ? "#10645C" : isDark ? "#15181B" : "#DDE1E4";

  const nameColor = isMine ? "rgba(255,255,255,0.85)" : accentColor;

  const bodyColor = isDeleted
    ? isMine
      ? "rgba(255,255,255,0.45)"
      : subtleText
    : isMine
      ? "rgba(255,255,255,0.62)"
      : isDark
        ? "#98A1A8"
        : "#4B5563";

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!canPress}
      hitSlop={6}
      style={{ marginBottom: 0 }}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: "row",
          alignItems: "stretch",
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          overflow: "hidden",
          backgroundColor: replyBg,
        }}
      >
        {/* 3px accent bar — full height, rounded left edge */}
        <View
          style={{
            width: 3,
            borderRadius: 1.5,
            backgroundColor: accentColor,
            opacity: isDeleted ? 0.3 : 1,
          }}
        />

        <View
          style={{
            flex: 1,
            minWidth: 0,
            paddingLeft: 8,
            paddingRight: 6,
            paddingTop: 5,
            paddingBottom: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 13,
                fontWeight: "700",
                color: nameColor,
                lineHeight: 16,
              }}
            >
              {repliedTo.senderName}
            </Text>
            {!isDeleted && (
              <Feather
                name="corner-up-left"
                size={11}
                color={isMine ? "rgba(255,255,255,0.4)" : subtleText}
                style={{ opacity: 0.8 }}
              />
            )}
          </View>
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={{
              marginTop: 1,
              fontSize: 12.5,
              lineHeight: 15.5,
              color: bodyColor,
              fontStyle: isDeleted ? "italic" : "normal",
            }}
          >
            {isDeleted
              ? "This message was deleted"
              : repliedTo.text?.trim() || "…"}
          </Text>
        </View>

        {/* Extra depress wash shown only while the block is held */}
        <Animated.View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            opacity: wash,
            backgroundColor: "rgba(0,0,0,0.10)",
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

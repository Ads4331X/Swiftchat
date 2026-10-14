import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppPressable as Pressable } from "@/components/ui/AppPressable";
import { MaterialIcons, Feather } from "@expo/vector-icons";
import { type Message } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";

type PinnedMessagesProps = {
  /** The pinned message shown in the banner. Render nothing when null. */
  msg: Message | null;
  /** Tap the banner (outside the close button) — usually scrolls to the message. */
  onPress?: (message: Message) => void;
  /** Tap the close button — usually unpins + clears the banner. */
  onUnpin?: (message: Message) => void;
  /** Show the pinners' name in group chats (WhatsApp/Instagram style). */
  isGroup?: boolean;
  /** Sender display name of the pinned message (resolved by the caller). */
  senderName?: string;
  /** Current user id — used to label the pinner "You". */
  currentUserId?: number | null;
};

/**
 * WhatsApp-style pinned-message banner: a thin strip pinned below the chat
 * header with a push-pin icon, "Pinned" label, a one-line preview and a close
 * button. Tapping the strip (not the X) lets the caller jump to the message.
 */
export default memo(function PinnedMessages({
  msg,
  onPress,
  onUnpin,
  isGroup,
  senderName,
  currentUserId,
}: PinnedMessagesProps) {
  const { colors, subtleText, dividerColor, inputBg } = useTheme();

  if (!msg) return null;

  const pinnerLabel =
    isGroup && senderName
      ? currentUserId != null && msg.senderId === currentUserId
        ? "You"
        : senderName
      : null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: dividerColor,
        backgroundColor: inputBg,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pinned message: ${msg.text}`}
        onPress={() => onPress?.(msg)}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          minWidth: 0,
          borderRadius: 8,
          opacity: pressed && !onUnpin ? 0.6 : 1,
        })}
      >
        {/* Push-pin icon */}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
            backgroundColor: `${BRAND_COLOR}1a`,
          }}
        >
          <MaterialIcons name="push-pin" size={15} color={BRAND_COLOR} />
        </View>

        {/* Preview */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 12,
                fontWeight: "700",
                letterSpacing: 0.2,
                color: BRAND_COLOR,
              }}
            >
              Pinned message
            </Text>
            {pinnerLabel ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: "500",
                  flexShrink: 1,
                  color: subtleText,
                }}
              >
                · {pinnerLabel}
              </Text>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontSize: 13,
              lineHeight: 17,
              marginTop: 1,
              color: colors.text,
              opacity: 0.85,
            }}
          >
            {msg.text?.trim() || "…"}
          </Text>
        </View>
      </Pressable>

      {/* Close / unpin */}
      {onUnpin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Unpin message"
          hitSlop={10}
          onPress={() => onUnpin(msg)}
          style={({ pressed }) => ({
            marginLeft: 8,
            padding: 4,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Feather name="x" size={18} color={subtleText} />
        </Pressable>
      ) : null}
    </View>
  );
});

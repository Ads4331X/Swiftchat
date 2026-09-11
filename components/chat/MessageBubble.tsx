import {
  Keyboard,
  Image,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import {
  type Message,
  type MessageReaction,
  type RepliedTo,
} from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";
import { memo, useEffect, useRef } from "react";
import { ReadReceipts } from "./ReadReceipts";

type Position = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

type MessageBubbleProps = {
  message: Message;
  isMine: boolean;
  textColor: string;
  bubbleColor: string;
  subtleText: string;
  onLongPress: (position: Position) => void;
  hidden?: boolean;
  showAvatar?: boolean;
  avatarUrl?: string;
  otherUsername?: string;
  isGroup?: boolean;
  senderName?: string;
  hasAnyoneRead?: boolean;
  hasEveryoneRead?: boolean;
  onQuotePress?: (messageId: number) => void;
  highlighted?: boolean;
  isFirstInGroup?: boolean;

  /** Resolved quoted-message data (falls back to `message.repliedTo`). */
  repliedTo?: RepliedTo;
  replyToId?: number;

  /** ID of the original message this message was forwarded from. */
  forwardedFromMsgId?: number;
};

type MessageBubbleContentProps = {
  text: string;
  isMine: boolean;
  textColor: string;
  bubbleColor: string;
  editedAt?: string;
  sentAt?: string;
  subtleText?: string;
  isPending?: boolean;
  isRead?: boolean;
  hasAnyoneRead?: boolean;
  hasEveryoneRead?: boolean;
  isGroup?: boolean;
  repliedTo?: RepliedTo;
  replyToId?: number;
  forwardedFromMsgId?: number;
  onQuotePress?: (messageId: number) => void;
  highlighted?: boolean;
};

function formatBubbleTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Color for the WhatsApp-style double-check "read" ticks on own messages.
const READ_TICK_COLOR = "#4FC3F7";

// Group a message's reactions by emoji into { emoji, count } summaries for the
// WhatsApp-style chip row. Order is preserved by first appearance.
function groupReactions(
  reactions?: MessageReaction[],
): { emoji: string; count: number }[] {
  if (!reactions || reactions.length === 0) return [];
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const r of reactions) {
    if (!counts.has(r.emoji)) {
      counts.set(r.emoji, 0);
      order.push(r.emoji);
    }
    counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  }
  return order.map((emoji) => ({ emoji, count: counts.get(emoji) ?? 0 }));
}

function ReactionChips({
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

  const countColor = isMine
    ? isDark
      ? "#fff"
      : "#fff"
    : isDark
      ? "#ECEDEE"
      : "#11181C";

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
// WhatsApp-style per-sender accent colors for group reply quotes, so a reply
// to Alice vs. a reply to Bob is visually distinct without relying on names alone.
const SENDER_ACCENTS = [
  "#06D6A0",
  "#F2994A",
  "#EF476F",
  "#8338EC",
  "#3A86FF",
  "#EC4899",
];
function accentForSender(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash << 5) - hash + name.charCodeAt(i);
  return SENDER_ACCENTS[Math.abs(hash) % SENDER_ACCENTS.length];
}

function RepliedToQuote({
  repliedTo,
  replyToId,
  isMine,
  isGroup,
  subtleText,
  onQuotePress,
}: {
  repliedTo: RepliedTo;
  replyToId?: number;
  isMine: boolean;
  isGroup?: boolean;
  subtleText?: string;
  onQuotePress?: (messageId: number) => void;
}) {
  const { isDark } = useTheme();
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
      : (subtleText ?? "#687076")
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
                color={
                  isMine ? "rgba(255,255,255,0.4)" : (subtleText ?? accentColor)
                }
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

export function MessageBubbleContent({
  text,
  isMine,
  textColor,
  bubbleColor,
  editedAt,
  sentAt,
  subtleText,
  isPending,
  isRead,
  hasAnyoneRead,
  hasEveryoneRead,
  isGroup = false,
  repliedTo,
  replyToId,
  onQuotePress,
  highlighted,
  forwardedFromMsgId,
}: MessageBubbleContentProps) {
  const wasEdited =
    editedAt &&
    sentAt &&
    new Date(editedAt).getTime() > new Date(sentAt).getTime();

  const tickColor = isMine
    ? "rgba(255,255,255,0.55)"
    : (subtleText ?? "#687076");

  const glowOpacity = useRef(new Animated.Value(0)).current;
  const landScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!highlighted) return;
    landScale.setValue(0.97);
    const anim = Animated.parallel([
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(550),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(landScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 8,
      }),
    ]);
    anim.start();
    return () => {
      anim.stop();
      glowOpacity.setValue(0);
      landScale.setValue(1);
    };
  }, [highlighted, glowOpacity, landScale]);

  return (
    <Animated.View style={{ transform: [{ scale: landScale }] }}>
      <View>
        {forwardedFromMsgId && (
          <View
            className="flex-row items-center"
            style={{ paddingHorizontal: 12, paddingBottom: 2 }}
          >
            <Feather
              name="arrow-right"
              size={12}
              color={
                isMine ? "rgba(255,255,255,0.85)" : (subtleText ?? "#687076")
              }
              style={{ marginRight: 6 }}
            />
            <Text
              className="text-xs font-semibold"
              style={{
                color: isMine
                  ? "rgba(255,255,255,0.85)"
                  : (subtleText ?? "#687076"),
              }}
            >
              Forwarded
            </Text>
          </View>
        )}
        {repliedTo && (
          <RepliedToQuote
            repliedTo={repliedTo}
            replyToId={replyToId}
            isMine={isMine}
            isGroup={isGroup}
            subtleText={subtleText}
            onQuotePress={onQuotePress}
          />
        )}
        <View
          className={`max-w-[100%] px-3 pt-2 pb-1 ${
            repliedTo ? "" : "rounded-[18px]"
          }`}
          style={{
            backgroundColor: isMine ? BRAND_COLOR : bubbleColor,
            borderBottomRightRadius: isMine ? 4 : 18,
            borderBottomLeftRadius: isMine ? 18 : 4,
            overflow: "hidden",
          }}
        >
          <Text
            className="text-[15px] leading-[20px]"
            style={{
              color: isMine ? "#fff" : textColor,
              flexShrink: 1,
            }}
          >
            {text}
          </Text>

          <View className="flex-row items-center self-end pt-[2px] ml-4">
            {wasEdited && !isPending && (
              <Text
                className="text-[10px]"
                style={{ color: tickColor, marginRight: 6 }}
              >
                Edited
              </Text>
            )}
            {sentAt && (
              <Text
                className="text-[10px]"
                style={{ color: tickColor, marginRight: isMine ? 3 : 0 }}
              >
                {isPending ? "Sending…" : formatBubbleTime(sentAt)}
              </Text>
            )}
            {isMine && (
              <ReadReceipts
                isPending={!!isPending}
                isRead={!!isRead}
                color={isMine && hasEveryoneRead ? READ_TICK_COLOR : tickColor}
                hasAnyoneRead={hasAnyoneRead}
                hasEveryoneRead={hasEveryoneRead}
                isGroup={isGroup}
              />
            )}
          </View>
          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: isMine ? "rgba(255,255,255,0.7)" : BRAND_COLOR,
              opacity: glowOpacity,
            }}
          />
        </View>
      </View>
    </Animated.View>
  );
}

let keyboardVisible = false;
Keyboard.addListener("keyboardDidShow", () => {
  keyboardVisible = true;
});
Keyboard.addListener("keyboardDidHide", () => {
  keyboardVisible = false;
});

export default memo(function MessageBubble({
  message,
  isMine,
  textColor,
  bubbleColor,
  subtleText,
  onLongPress,
  hidden,
  showAvatar,
  avatarUrl,
  otherUsername,
  isGroup = false,
  senderName,
  hasAnyoneRead,
  hasEveryoneRead,
  onQuotePress,
  highlighted,
  repliedTo: repliedToProp,
  replyToId: replyToIdProp,
  forwardedFromMsgId: forwardedFromMsgIdProp,
  isFirstInGroup,
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null);
  const AVATAR_SIZE = 28;

  const handleLongPress = () => {
    const measure = () => {
      bubbleRef.current?.measureInWindow(
        (pageX: number, pageY: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            onLongPress({ pageX, pageY, width, height });
          }
        },
      );
    };

    if (keyboardVisible) {
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        measure();
      });
      Keyboard.dismiss();
    } else {
      measure();
    }
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={300}>
      <View
        className={`flex-row px-1 ${isMine ? "justify-end" : "justify-start"}`}
        style={{ marginTop: isFirstInGroup ? 10 : 2 }}
      >
        {/* Avatar space — only on other person's last-in-group message */}
        {!isMine ? (
          <View
            style={{
              width: AVATAR_SIZE + 4,
              justifyContent: "flex-end",
              alignItems: "center",
              marginRight: 2,
            }}
          >
            {showAvatar && avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                }}
              />
            ) : showAvatar ? (
              <View
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  backgroundColor: BRAND_COLOR,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}
                >
                  {otherUsername?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View
          ref={bubbleRef}
          style={{
            opacity: hidden ? 0 : 1,
            maxWidth: "80%",
            alignSelf: isMine ? "flex-end" : "flex-start",
            marginBottom:
              message.reactions && message.reactions.length > 0 ? 14 : 0,
          }}
        >
          {isGroup && !isMine && showAvatar && senderName ? (
            <Text
              className="text-xs font-semibold mb-0.5"
              style={{ color: BRAND_COLOR, paddingHorizontal: 4 }}
            >
              {senderName}
            </Text>
          ) : null}
          <MessageBubbleContent
            text={message.text}
            isMine={isMine}
            textColor={textColor}
            bubbleColor={bubbleColor}
            subtleText={subtleText}
            editedAt={message.editedAt ?? undefined}
            sentAt={message.sentAt}
            isPending={message.id < 0}
            isRead={message.read}
            hasAnyoneRead={hasAnyoneRead}
            hasEveryoneRead={hasEveryoneRead}
            isGroup={isGroup}
            repliedTo={repliedToProp ?? message.repliedTo}
            replyToId={replyToIdProp ?? message.replyToId}
            forwardedFromMsgId={forwardedFromMsgIdProp ?? message.forwardedFromMsgId}
            onQuotePress={onQuotePress}
            highlighted={highlighted}
          />
          <ReactionChips reactions={message.reactions} isMine={isMine} />
        </View>
      </View>
    </Pressable>
  );
});

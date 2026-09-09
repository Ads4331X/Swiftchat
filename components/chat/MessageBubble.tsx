import { Keyboard, Image, Pressable, Text, View } from "react-native";
import { type Message, type MessageReaction } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";
import { useTheme } from "@/constants/theme-provider";
import { memo, useRef } from "react";
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
}: MessageBubbleContentProps) {
  const wasEdited =
    editedAt &&
    sentAt &&
    new Date(editedAt).getTime() > new Date(sentAt).getTime();

  const tickColor = isMine
    ? "rgba(255,255,255,0.55)"
    : (subtleText ?? "#687076");

  return (
    <View
      className="max-w-[100%] self-start px-3 py-2 rounded-2xl"
      style={{
        backgroundColor: isMine ? BRAND_COLOR : bubbleColor,
        borderBottomRightRadius: isMine ? 4 : 16,
        borderBottomLeftRadius: isMine ? 16 : 4,
        overflow: "hidden",
      }}
    >
      <Text
        className="text-[15px] leading-5"
        style={{
          color: isMine ? "#fff" : textColor,
          flexShrink: 1,
        }}
      >
        {text}
      </Text>

      <View className="flex-row items-center gap-1 mt-1 self-end">
        {wasEdited && !isPending && (
          <Text className="text-[10px]" style={{ color: tickColor }}>
            Edited
          </Text>
        )}
        {sentAt && (
          <Text className="text-[10px]" style={{ color: tickColor }}>
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
    </View>
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
        className={`flex-row px-1 py-[1px] ${isMine ? "justify-end" : "justify-start"}`}
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
          />
          <ReactionChips reactions={message.reactions} isMine={isMine} />
        </View>
      </View>
    </Pressable>
  );
});

import { Keyboard, Image, Pressable, Text, View } from "react-native";
import { type Message } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";
import { useRef } from "react";
import Feather from "@expo/vector-icons/Feather";

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
};

function formatBubbleTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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
}: MessageBubbleContentProps) {
  const wasEdited =
    editedAt &&
    sentAt &&
    new Date(editedAt).getTime() > new Date(sentAt).getTime();

  const tickColor = isMine ? "rgba(255,255,255,0.55)" : subtleText;

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
          <Feather
            name={isPending ? "clock" : "check"}
            size={11}
            color={tickColor}
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

export default function MessageBubble({
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
          }}
        >
          <MessageBubbleContent
            text={message.text}
            isMine={isMine}
            textColor={textColor}
            bubbleColor={bubbleColor}
            subtleText={subtleText}
            editedAt={message.editedAt ?? undefined}
            sentAt={message.sentAt}
            isPending={message.id < 0}
          />
        </View>
      </View>
    </Pressable>
  );
}

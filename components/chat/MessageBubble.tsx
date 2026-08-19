import { Keyboard, Pressable, Text, View } from "react-native";
import { type Message } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";
import { useRef } from "react";

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
};

type MessageBubbleContentProps = {
  text: string;
  isMine: boolean;
  textColor: string;
  bubbleColor: string;
  editedAt?: string;
  sentAt?: string;
  subtleText?: string;
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
}: MessageBubbleContentProps) {
  const wasEdited =
    editedAt &&
    sentAt &&
    new Date(editedAt).getTime() > new Date(sentAt).getTime();

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
        {wasEdited && (
          <Text
            className="text-[10px]"
            style={{ color: isMine ? "rgba(255,255,255,0.55)" : subtleText }}
          >
            Edited
          </Text>
        )}
        {sentAt && (
          <Text
            className="text-[10px]"
            style={{ color: isMine ? "rgba(255,255,255,0.55)" : subtleText }}
          >
            {formatBubbleTime(sentAt)}
          </Text>
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
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null);

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
    <Pressable onLongPress={handleLongPress} delayLongPress={400}>
      <View
        className={`flex-row px-1 py-[1px] ${isMine ? "justify-end" : "justify-start"}`}
      >
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
            editedAt={message.editedAt}
            sentAt={message.sentAt}
          />
        </View>
      </View>
    </Pressable>
  );
}

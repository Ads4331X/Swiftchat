import { Text, View } from "react-native";
import { type Message } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";

type MessageBubbleProps = {
  message: Message;
  isMine: boolean;
  textColor: string;
  bubbleColor: string;
};

export default function MessageBubble({
  message,
  isMine,
  textColor,
  bubbleColor,
}: MessageBubbleProps) {
  return (
    <View
      className={`flex-row px-3 py-1 ${isMine ? "justify-end" : "justify-start"}`}
    >
      <View
        className="max-w-[75%] px-3 py-2 rounded-2xl"
        style={{
          backgroundColor: isMine ? BRAND_COLOR : bubbleColor,
          borderBottomRightRadius: isMine ? 4 : 16,
          borderBottomLeftRadius: isMine ? 16 : 4,
        }}
      >
        <Text
          className="text-[15px] leading-5"
          style={{ color: isMine ? "#fff" : textColor }}
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
}

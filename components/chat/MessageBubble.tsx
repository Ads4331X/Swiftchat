import { Pressable, Text, View } from "react-native";
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
  onLongPress: (position: Position) => void;
  /** True while this exact message is "lifted" into the action sheet, so
   * only the floating copy is visible and the list doesn't show a duplicate.
   * Layout space is preserved (opacity only) so nothing reflows. */
  hidden?: boolean;
};

type MessageBubbleContentProps = {
  text: string;
  isMine: boolean;
  textColor: string;
  bubbleColor: string;
};

/**
 * The actual bubble visuals — pulled out so the action sheet's floating
 * preview can render *exactly* this, with the same padding, radius, and
 * font. Any drift here (e.g. a hardcoded padding value elsewhere) is what
 * causes the floating copy to reflow text differently than the real bubble.
 */
export function MessageBubbleContent({
  text,
  isMine,
  textColor,
  bubbleColor,
}: MessageBubbleContentProps) {
  return (
    <View
      className="max-w-[100%] self-start px-3 py-2 rounded-2xl"
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
        {text}
      </Text>
    </View>
  );
}

export default function MessageBubble({
  message,
  isMine,
  textColor,
  bubbleColor,
  onLongPress,
  hidden,
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null);

  const handleLongPress = () => {
    bubbleRef.current?.measureInWindow(
      (pageX: number, pageY: number, width: number, height: number) => {
        if (width > 0 && height > 0) {
          onLongPress({ pageX, pageY, width, height });
        }
      },
    );
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={400}>
      <View
        className={`flex-row  px-1 py-[1px] ${isMine ? "justify-end" : "justify-start"}`}
      >
        <View ref={bubbleRef} style={{ opacity: hidden ? 0 : 1 }}>
          <MessageBubbleContent
            text={message.text}
            isMine={isMine}
            textColor={textColor}
            bubbleColor={bubbleColor}
          />
        </View>
      </View>
    </Pressable>
  );
}

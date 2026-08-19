import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { type RefObject } from "react";
import { type Message } from "@/hooks/useChatMessages";
import MessageBubble from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { BRAND_COLOR } from "@/constants/theme";

type Position = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

type MessageListProps = {
  messages: Message[];
  loading: boolean;
  currentUserId: number | null;
  listRef: RefObject<FlatList<Message> | null>;
  textColor: string;
  bubbleColor: string;
  subtleText: string;
  onMessageLongPress: (message: Message, position: Position) => void;
  /** id of the message currently lifted into the action sheet, if any. */
  selectedMessageId?: number | null;
  /** true while the other user is typing — rendered as a bubble-style
   * row at the bottom of the list, same as a real incoming message. */
  isOtherUserTyping?: boolean;
};

export default function MessageList({
  messages,
  loading,
  currentUserId,
  listRef,
  textColor,
  bubbleColor,
  subtleText,
  onMessageLongPress,
  selectedMessageId,
  isOtherUserTyping,
}: MessageListProps) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={BRAND_COLOR} size="large" />
      </View>
    );
  }

  if (messages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text style={{ color: subtleText }} className="text-base">
          No messages yet
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={messages}
      keyExtractor={(message) => String(message.id)}
      renderItem={({ item }) => (
        <MessageBubble
          message={item}
          isMine={item.senderId === currentUserId}
          textColor={textColor}
          bubbleColor={bubbleColor}
          subtleText={subtleText}
          hidden={item.id === selectedMessageId}
          onLongPress={(position) => onMessageLongPress(item, position)}
        />
      )}
      ListFooterComponent={
        isOtherUserTyping ? (
          <View className="flex-row justify-start px-1 py-[1px] mt-1">
            <View
              className="px-3 py-2 rounded-2xl"
              style={{
                backgroundColor: bubbleColor,
                borderBottomLeftRadius: 4,
                alignSelf: "flex-start",
              }}
            >
              <TypingIndicator />
            </View>
          </View>
        ) : null
      }
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingVertical: 12 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onContentSizeChange={() =>
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50)
      }
    />
  );
}

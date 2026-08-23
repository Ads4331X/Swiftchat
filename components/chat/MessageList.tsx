import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { type RefObject, useCallback, useMemo, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
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
  messages: Message[]; // chronological, oldest -> newest (unchanged from hook)
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  currentUserId: number | null;
  listRef: RefObject<FlatList<Message> | null>;
  textColor: string;
  bubbleColor: string;
  subtleText: string;
  onMessageLongPress: (message: Message, position: Position) => void;
  selectedMessageId?: number | null;
  isOtherUserTyping?: boolean;
  onLoadMore: () => void;
  onScrollToEndRef?: RefObject<(() => void) | null>;
  otherAvatarUrl?: string;
  otherUsername?: string;
};

// How far (px) from the bottom counts as "still at the bottom" for the
// jump-to-bottom button. In an inverted list, offset 0 IS the bottom.
const SHOW_BUTTON_THRESHOLD = 300;

export default function MessageList({
  messages,
  loading,
  loadingMore,
  hasMore,
  currentUserId,
  listRef,
  textColor,
  bubbleColor,
  subtleText,
  onMessageLongPress,
  selectedMessageId,
  isOtherUserTyping,
  onLoadMore,
  onScrollToEndRef,
  otherAvatarUrl,
  otherUsername,
}: MessageListProps) {
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Inverted FlatList expects newest-first data — index 0 renders at the
  // visual bottom. This is what makes the list "just work": no imperative
  // scrollToEnd, no fighting virtualization, no jump when the keyboard opens.
  const invertedData = useMemo(() => [...messages].reverse(), [messages]);

  // Show avatar only on the last message in a consecutive group from the same
  // sender (WhatsApp style). "Last" = closest to newest, so in chronological
  // order that's the message whose next sibling is from a different sender (or
  // is the very last message).
  const showAvatarSet = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < messages.length; i++) {
      const next = messages[i + 1];
      if (!next || next.senderId !== messages[i].senderId) {
        set.add(messages[i].id);
      }
    }
    return set;
  }, [messages]);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const shouldShowButton = offsetY > SHOW_BUTTON_THRESHOLD;
      setShowScrollButton((prev) =>
        prev === shouldShowButton ? prev : shouldShowButton,
      );
    },
    [],
  );

  const handleEndReached = useCallback(() => {
    // "End" of an inverted list is the oldest-messages side — perfect for
    // pagination, and far more reliable than measuring scroll distance
    // manually against a growing/virtualized content size.
    if (hasMore && !loadingMore) {
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  const scrollToBottom = useCallback(
    (animated = true) => {
      setShowScrollButton(false);
      listRef.current?.scrollToOffset({ offset: 0, animated });
    },
    [listRef],
  );

  // Expose a force-scroll-to-bottom to the parent (used after sending).
  if (onScrollToEndRef) {
    onScrollToEndRef.current = () => scrollToBottom(true);
  }

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
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        inverted
        data={invertedData}
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
            showAvatar={showAvatarSet.has(item.id)}
            avatarUrl={otherAvatarUrl}
            otherUsername={otherUsername}
          />
        )}
        // NOTE: with `inverted`, header/footer are visually swapped —
        // ListHeaderComponent renders at the BOTTOM, ListFooterComponent
        // renders at the TOP.
        ListHeaderComponent={
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
        ListFooterComponent={
          loadingMore ? (
            <View className="py-3 items-center">
              <ActivityIndicator color={BRAND_COLOR} size="small" />
            </View>
          ) : null
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
      />

      {showScrollButton && (
        <Pressable
          onPress={() => scrollToBottom(true)}
          hitSlop={8}
          style={{
            position: "absolute",
            bottom: 16,
            alignSelf: "center",
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: bubbleColor,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <Feather name="chevron-down" size={20} color={textColor} />
        </Pressable>
      )}
    </View>
  );
}

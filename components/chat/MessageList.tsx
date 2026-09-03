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
import EmptyState from "@/components/ui/EmptyState";
import { markRead } from "@/lib/db";
import { api } from "@/lib/api";
import { listenForMarkRead } from "@/lib/socket";
import { useEffect } from "react";
import Avatar from "../profile/Avatar";

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
  isOtherUserTyping?: number[];
  onLoadMore: () => void;
  onScrollToEndRef?: RefObject<(() => void) | null>;
  otherAvatarUrl?: string;
  otherUsername?: string;
  isGroup?: boolean;
  members?: { id: number; username: string; avatar?: string }[];
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
  isGroup = false,
  members = [],
}: MessageListProps) {
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Lookup sender display names/avatars for group bubbles & typing indicator.
  const memberById = useMemo(() => {
    const map = new Map<number, { username: string; avatar?: string }>();
    for (const m of members) {
      if (m.username && m.username !== "You") {
        map.set(m.id, { username: m.username, avatar: m.avatar });
      }
    }
    return map;
  }, [members]);

  // The people who are typing right now (with name + avatar for display).
  const typingMembers = useMemo(() => {
    const ids = isOtherUserTyping ?? [];
    return ids
      .map((id) => memberById.get(id))
      .filter((m): m is { username: string; avatar?: string } => Boolean(m));
  }, [isOtherUserTyping, memberById]);

  // Format "who is typing" into a readable sentence from the typing members.
  const typingText = useMemo(() => {
    const names = typingMembers.map((m) => m.username);
    if (names.length === 0) return "typing…";
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return "Several people are typing…";
  }, [typingMembers]);

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

  useEffect(() => {
    const unsubscribe = listenForMarkRead(
      async ({ conversationId, messageId, userId, readAt }) => {
        await markRead({
          conversationId,
          messageId,
          userId,
          readAt,
        });
      },
    );
    return unsubscribe;
  }, []);

  const handleViewableItemsChanged = useCallback(
    async ({ viewableItems }: any) => {
      for (let i = viewableItems.length - 1; i >= 0; i--) {
        const msg = viewableItems[i].item;

        if (msg.senderId !== currentUserId) {
          await api.post(
            `/api/conversations/messages/${msg.conversationId}/mark-read`,
            {
              messageId: msg.id,
            },
          );

          return;
        }
      }
    },
    [currentUserId],
  );

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

  // Stable renderItem so React.memo'ed MessageBubbles only re-render when
  // their own message actually changed — not on every array rebuild.
  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
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
        isGroup={isGroup}
        senderName={memberById.get(item.senderId)?.username}
      />
    ),
    [
      currentUserId,
      textColor,
      bubbleColor,
      subtleText,
      selectedMessageId,
      onMessageLongPress,
      showAvatarSet,
      otherAvatarUrl,
      otherUsername,
      isGroup,
      memberById,
    ],
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
      <EmptyState
        icon="message-square"
        title="Say hi"
        message="Send your first message to start the conversation."
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        inverted
        data={invertedData}
        keyExtractor={(message) => message.key ?? String(message.id)}
        renderItem={renderItem}
        onViewableItemsChanged={handleViewableItemsChanged}
        // NOTE: with `inverted`, header/footer are visually swapped —
        // ListHeaderComponent renders at the BOTTOM, ListFooterComponent
        // renders at the TOP.
        ListHeaderComponent={
          isOtherUserTyping?.length ? (
            <View className="flex-row justify-start px-1 py-[1px] mt-1">
              <View
                className="px-3 py-2 rounded-2xl"
                style={{
                  backgroundColor: bubbleColor,
                  borderBottomLeftRadius: 4,
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View className="flex-row">
                  {typingMembers.map((member, index) => (
                    <View
                      key={index}
                      className="rounded-full"
                      style={{
                        borderWidth: 2,
                        borderColor: bubbleColor,
                        marginLeft: index === 0 ? 0 : -8,
                      }}
                    >
                      <Avatar
                        username={member.username}
                        avatarUrl={member.avatar}
                        size={24}
                      />
                    </View>
                  ))}
                </View>
                {/* <Text style={{ color: subtleText }} className="text-sm">
                  {typingText}
                </Text> */}
                <TypingIndicator color={subtleText} />
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

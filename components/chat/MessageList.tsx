import { FlatList, Pressable, Text, View } from "react-native";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { type Message, type RepliedTo } from "@/hooks/useChatMessages";
import MessageBubble from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import MessageSkeleton from "./MessageSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { getUser, markRead } from "@/lib/db";
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
  initialized: boolean;
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
  scrollToMessageRef?: RefObject<((messageId: number) => void) | null>;
  otherAvatarUrl?: string;
  otherUsername?: string;
  isGroup?: boolean;
  members?: { id: number; username: string; avatar?: string }[];
  onQuotePress?: (messageId: number) => void;
  showSkeleton?: boolean;
  serverLoaded?: boolean;
  hideAttachmentOptions: () => void;
};

// How far (px) from the bottom counts as "still at the bottom" for the
// jump-to-bottom button. In an inverted list, offset 0 IS the bottom.
const SHOW_BUTTON_THRESHOLD = 300;

export default function MessageList({
  messages,
  initialized,
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
  scrollToMessageRef,
  otherAvatarUrl,
  otherUsername,
  isGroup = false,
  members = [],
  onQuotePress,
  showSkeleton = false,
  hideAttachmentOptions,
  serverLoaded = false,
}: MessageListProps) {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [readersByMessage, setReadersByMessage] = useState<
    Record<number, Set<number>>
  >({});

  useEffect(() => {
    if (!scrollToMessageRef) return;

    scrollToMessageRef.current = (messageId: number) => {
      const index = messages.findIndex((message) => message.id === messageId);

      if (index === -1) return;

      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    };

    return () => {
      scrollToMessageRef.current = null;
    };
  }, [messages]);

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

  // Lookup original messages by id — used to render reply quotes client-side.
  const messageById = useMemo(() => {
    const map = new Map<number, Message>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  // Resolve the quoted message for a reply. Prefers the server-provided
  // snapshot; falls back to deriving it from the message list (perfect for
  // optimistic rows and messages sent right now).
  const resolveRepliedTo = useCallback(
    (
      message: Message,
    ): { repliedTo?: RepliedTo; replyToId?: number } | null => {
      if (message.repliedTo) return null;
      if (message.replyToId == null) return null;

      const original = messageById.get(message.replyToId);
      if (!original) return null;

      const senderName =
        original.senderId === currentUserId
          ? "You"
          : (memberById.get(original.senderId)?.username ??
            otherUsername ??
            `User ${original.senderId}`);

      return {
        repliedTo: { senderName, text: original.text },
        replyToId: message.replyToId,
      };
    },
    [messageById, memberById, currentUserId, otherUsername],
  );

  // The people who are typing right now (with name + avatar for display).
  const typingMembers = useMemo(() => {
    const ids = isOtherUserTyping ?? [];
    return ids
      .map((id) => memberById.get(id))
      .filter(
        (
          m,
        ): m is {
          id: number;
          username: string;
          avatar?: string;
          localAvatarUrlPath: string | null;
        } => Boolean(m),
      );
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

  // First message in a consecutive same-sender run — gets extra top spacing so
  // groups read clearly, while consecutive messages stay tightly packed.
  const firstInGroupSet = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < messages.length; i++) {
      const prev = messages[i - 1];
      if (!prev || prev.senderId !== messages[i].senderId) {
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

        if (userId === currentUserId) return;

        setReadersByMessage((prev) => {
          const existing = prev[messageId] ?? new Set<number>();
          const next = new Set(existing);
          next.add(userId);

          return {
            ...prev,
            [messageId]: next,
          };
        });
      },
    );

    return unsubscribe;
  }, [currentUserId]);
  const handleViewableItemsChanged = useCallback(
    async ({ viewableItems }: any) => {
      // Inverted list: data[0] is the newest message, so forward iteration
      // marks the newest visible incoming message. The backend marks every
      // message with id <= this one ({ id: { lte: messageId } }), so the
      // newest covers all older unread messages in one call.
      for (let i = 0; i < viewableItems.length; i++) {
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

  // Scroll to a specific message (used when tapping a reply quote).
  const scrollToMessage = useCallback(
    (messageId: number) => {
      const index = invertedData.findIndex((m) => m.id === messageId);
      if (index < 0) return;

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      setHighlightedId(messageId);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedId(null);
        highlightTimerRef.current = null;
      }, 1500);

      listRef.current?.scrollToIndex({
        index,
        viewPosition: 0.5,
        animated: true,
      });
    },
    [invertedData, listRef],
  );

  const handleScrollToIndexFailed = useCallback(() => {
    // The target message isn't rendered yet (virtualization). Scroll to the
    // nearest rendered end, then retry on the next frame.
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    requestAnimationFrame(() => {
      const target = highlightedId ?? null;
      if (target != null) {
        scrollToMessage(target);
      }
    });
  }, [highlightedId, scrollToMessage, listRef]);

  // Stable renderItem so React.memo'ed MessageBubbles only re-render when
  // their own message actually changed — not on every array rebuild.
  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const readers = readersByMessage[item.id] ?? new Set<number>();

      const otherMembers = members.filter(
        (member) => member.id !== currentUserId,
      );

      const hasAnyoneRead = readers.size > 0;

      const hasEveryoneRead =
        otherMembers.length > 0 &&
        otherMembers.every((member) => readers.has(member.id));

      const resolved = resolveRepliedTo(item);
      return (
        <MessageBubble
          message={item}
          isMine={item.senderId === currentUserId}
          textColor={textColor}
          bubbleColor={bubbleColor}
          subtleText={subtleText}
          hidden={item.id === selectedMessageId}
          onLongPress={(position) => onMessageLongPress(item, position)}
          showAvatar={showAvatarSet.has(item.id)}
          isFirstInGroup={firstInGroupSet.has(item.id)}
          avatarUrl={otherAvatarUrl}
          otherUsername={otherUsername}
          isGroup={isGroup}
          senderName={memberById.get(item.senderId)?.username}
          hasAnyoneRead={hasAnyoneRead}
          hasEveryoneRead={hasEveryoneRead}
          highlighted={item.id === highlightedId}
          repliedTo={resolved?.repliedTo ?? item.repliedTo}
          replyToId={resolved?.replyToId ?? item.replyToId}
          onQuotePress={(id) => {
            scrollToMessage(id);
            onQuotePress?.(id);
          }}
        />
      );
    },
    [
      currentUserId,
      textColor,
      bubbleColor,
      subtleText,
      selectedMessageId,
      onMessageLongPress,
      showAvatarSet,
      firstInGroupSet,
      otherAvatarUrl,
      otherUsername,
      isGroup,
      memberById,
      members,
      readersByMessage,
      highlightedId,
      scrollToMessage,
      onQuotePress,
      resolveRepliedTo,
    ],
  );

  // Expose a force-scroll-to-bottom to the parent (used after sending).
  if (onScrollToEndRef) {
    onScrollToEndRef.current = () => scrollToBottom(true);
  }

  // Expose scroll-to-message to the parent (used when tapping a pinned banner).
  if (scrollToMessageRef) {
    scrollToMessageRef.current = scrollToMessage;
  }

  const renderList = () => (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        inverted
        data={invertedData}
        keyExtractor={(message) => message.key ?? String(message.id)}
        renderItem={renderItem}
        onViewableItemsChanged={handleViewableItemsChanged}
        onTouchStart={hideAttachmentOptions}
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
                  {typingMembers.map(async (member, index) => {
                    const user = await getUser(member.id);
                    return (
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
                          localAvatarUrlPath={
                            user ? user.localAvatarUrlPath : null
                          }
                        />
                      </View>
                    );
                  })}
                </View>
                <Text style={{ color: subtleText }} className="text-sm">
                  {typingText}
                </Text>
                <TypingIndicator color={subtleText} />
              </View>
            </View>
          ) : null
        }
        ListFooterComponent={null}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 12 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={handleScrollToIndexFailed}
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

  // Messages are the priority — even on the first frame of a reopen they
  // render immediately, so no skeleton/"Say hi" can flash over real content.
  if (messages.length > 0) {
    return renderList();
  }

  // Instagram-style skeleton: only on the very first time opening this chat.
  if (showSkeleton) {
    return <MessageSkeleton />;
  }

  if (!initialized) {
    // Brief window before the cache read resolves on a REOPEN (already seen
    // this session) — render nothing so no misleading empty state appears.
    return <View className="flex-1" />;
  }

  // Still waiting on the server page: render nothing rather than flashing the
  // "Say hi" empty state over a chat that may well have messages.
  if (!serverLoaded) {
    return <View className="flex-1" />;
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

  return renderList();
}

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList } from "react-native";
import { useSharedValue, withSpring } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";
import useChatParticipant from "@/hooks/useChatParticipant";
import { conversationDisplayName } from "@/lib/conversation";
import useChatTyping from "@/hooks/useChatTyping";
import { useKeySetup } from "@/hooks/useKeySetup";
import ChatActions from "@/components/chat/ChatActions";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageList from "@/components/chat/MessageList";
import PinModal from "@/components/security/PinModal";
import { listenForGroupDelete } from "@/lib/socket";

type Position = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export default function UserChat() {
  const { id, username, avatarUrl, memberIds } = useLocalSearchParams<{
    id: string;
    username?: string;
    avatarUrl?: string;
    memberIds?: string;
  }>();

  const otherMemberIds = (memberIds ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number);
  const memberCount = otherMemberIds.length + 1;
  const isGroup = otherMemberIds.length > 1;
  const {
    colors,
    subtleText,
    dividerColor,
    inputBg,
    inputBorderColor,
    placeholderColor,
  } = useTheme();
  const insets = useSafeAreaInsets();
  const pressProgress = useSharedValue(0);
  const {
    needsPin,
    pinMode,
    busy: pinBusy,
    keyReadyVersion,
    setUpKeys,
    submitPin,
    skip: skipPin,
  } = useKeySetup();
  const [pinError, setPinError] = useState<string | null>(null);
  const {
    currentUserId,
    conversationKey,
    conversationName,
    otherUser,
    members,
  } = useChatParticipant(id, memberIds, keyReadyVersion, setUpKeys);
  const { isOtherUserTyping, notifyDraftChange, stopTyping } = useChatTyping(
    id,
    currentUserId,
  );
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    sendMessage,
    deleteMessage,
    editMessage,
    reactToMessage,
    loadMore,
  } = useChatMessages(id, currentUserId, conversationKey);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<Position | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const scrollToEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = listenForGroupDelete(({ conversationId }) => {
      if (Number(conversationId) === Number(id)) {
        router.replace("/chat");
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [id]);
  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft("");
    setSending(true);
    try {
      if (editingMessageId != null) {
        await editMessage(editingMessageId, text);
        setEditingMessageId(null);
      } else {
        await sendMessage(text);
      }
      stopTyping();
      scrollToEndRef.current?.();
    } finally {
      setSending(false);
    }
  };

  const handleLongPress = (message: Message, position: Position) => {
    setSelectedMessage(message);
    setMenuPosition(position);
    pressProgress.value = withSpring(1, { damping: 28, stiffness: 300 });
  };

  const handleEdit = () => {
    if (!selectedMessage) return;
    setEditingMessageId(selectedMessage.id);
    setDraft(selectedMessage.text);
  };

  const closeActions = () => {
    setSelectedMessage(null);
    setMenuPosition(null);
  };

  const otherMembers =
    currentUserId == null
      ? members.filter((m) => m.username !== "You")
      : members.filter((m) => m.id !== currentUserId);
  const headerName =
    conversationName != null
      ? conversationDisplayName(conversationName, otherMembers)
      : username || otherUser?.username || "Chat";

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top", "left", "right"]}
      style={{ backgroundColor: colors.background }}
    >
      <ChatHeader
        userId={otherUser?.userId}
        username={headerName}
        avatarUrl={isGroup ? "" : (otherUser?.avatarUrl ?? avatarUrl)}
        isGroup={isGroup}
        memberCount={memberCount}
        textColor={colors.text}
        dividerColor={dividerColor}
        backgroundColor={colors.background}
        chatId={id}
        memberIds={isGroup ? memberIds : undefined}
      />
      <MessageList
        messages={messages}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={hasMore}
        currentUserId={currentUserId}
        listRef={listRef}
        textColor={colors.text}
        bubbleColor={inputBg}
        subtleText={subtleText}
        selectedMessageId={selectedMessage?.id ?? null}
        onMessageLongPress={handleLongPress}
        isOtherUserTyping={isOtherUserTyping}
        onLoadMore={loadMore}
        onScrollToEndRef={scrollToEndRef}
        otherAvatarUrl={otherUser?.avatarUrl ?? avatarUrl ?? ""}
        otherUsername={otherUser?.username ?? username ?? ""}
        isGroup={isGroup}
        members={members}
      />
      <ChatComposer
        draft={draft}
        editing={editingMessageId != null}
        onDraftChange={(text) => {
          setDraft(text);
          notifyDraftChange();
        }}
        onSend={handleSend}
        onCancelEdit={() => {
          setEditingMessageId(null);
          setDraft("");
        }}
        sending={sending}
        insets={insets}
        inputBg={inputBg}
        inputBorderColor={inputBorderColor}
        placeholderColor={placeholderColor}
        textColor={colors.text}
        subtleText={subtleText}
        dividerColor={dividerColor}
        backgroundColor={colors.background}
      />
      <ChatActions
        message={selectedMessage}
        currentUserId={currentUserId}
        position={menuPosition}
        textColor={colors.text}
        bubbleColor={inputBg}
        onEdit={handleEdit}
        onDelete={() => selectedMessage && deleteMessage(selectedMessage.id)}
        onReact={(emoji) =>
          selectedMessage && reactToMessage(selectedMessage.id, emoji)
        }
        onDismissStart={() => {
          pressProgress.value = withSpring(0, { damping: 28, stiffness: 300 });
        }}
        onClose={closeActions}
      />
      <PinModal
        visible={needsPin}
        mode={pinMode}
        error={pinError}
        loading={pinBusy}
        onSubmit={async (pin) => {
          const result = await submitPin(pin);
          setPinError(
            result.ok
              ? null
              : result.error || "Incorrect PIN. Please try again.",
          );
        }}
        onCancel={skipPin}
      />
    </SafeAreaView>
  );
}

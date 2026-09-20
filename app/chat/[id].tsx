import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList } from "react-native";
import { useSharedValue, withSpring } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import BottomSheet from "@gorhom/bottom-sheet";

import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";
import useChatParticipant from "@/hooks/useChatParticipant";
import { conversationDisplayName } from "@/lib/utils";
import useChatTyping from "@/hooks/useChatTyping";
import { useKeySetup } from "@/hooks/useKeySetup";
import ChatActions from "@/components/chat/ChatActions";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageList from "@/components/chat/MessageList";
import ForwardSheet from "@/components/chat/forward/ForwardSheet";
import PinModal from "@/components/security/PinModal";
import { listenForGroupDelete } from "@/lib/socket";
import { onScrollToMessage } from "@/lib/sync/scrollToMessage";
import {
  deletePinnedMessageLocal,
  getPinnedMessageLocal,
  savePinnedMessage,
} from "@/lib/db";
import PinnedMessages from "@/components/chat/PinnedMessages";
import { api } from "@/lib/api";
import { formatPresence } from "@/lib/utils/formatPresence";

type Position = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export default function UserChat() {
  const { id, username, avatarUrl, memberIds, messageId } =
    useLocalSearchParams<{
      id: string;
      username?: string;
      avatarUrl?: string;
      memberIds?: string;
      messageId?: string;
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
    isAdmin,
  } = useChatParticipant(id, memberIds, keyReadyVersion, setUpKeys);
  const { isOtherUserTyping, notifyDraftChange, stopTyping } = useChatTyping(
    id,
    currentUserId,
  );
  const {
    messages,
    showSkeleton,
    initialized,
    loadingMore,
    hasMore,
    sendMessage,
    deleteMessage,
    editMessage,
    replyMessage,
    reactToMessage,
    loadMore,
  } = useChatMessages(id, currentUserId, conversationKey);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<number | null>(null);
  const pinnedFetchedRef = useRef(false);
  const scrollToMessageRef = useRef<((messageId: number) => void) | null>(null);
  const pinnedMsg =
    pinnedMessageId != null
      ? (messages.find((m) => m.id === pinnedMessageId) ?? null)
      : null;
  const [replyingMessageId, setReplyingMessageId] = useState<number | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<Position | null>(null);
  const [messageToForward, setMessageToForward] = useState<Message | null>(
    null,
  );
  const listRef = useRef<FlatList<Message>>(null);
  const scrollToEndRef = useRef<(() => void) | null>(null);
  const forwardSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (!messageId || messages.length === 0) return;

    const timer = setTimeout(() => {
      scrollToMessageRef.current?.(Number(messageId));
    }, 100);

    return () => clearTimeout(timer);
  }, [messageId, messages]);

  // A message-search screen can jump us here by emitting an event (then the
  // search screen dismisses back into this already-mounted chat). Scroll to
  // the target message whenever it's reported.
  useEffect(() => {
    return onScrollToMessage(({ conversationId, messageId }) => {
      if (Number(conversationId) !== Number(id)) return;
      setTimeout(() => {
        scrollToMessageRef.current?.(Number(messageId));
      }, 100);
    });
  }, [id]);

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

  // Fetch the pinned message banner once messages have loaded.
  useEffect(() => {
    if (pinnedFetchedRef.current || messages.length === 0) return;
    const realMsg = messages.find((m) => m.id > 0);
    if (!realMsg) return;
    pinnedFetchedRef.current = true;
    (async () => {
      const local = await getPinnedMessageLocal(Number(id));
      if (local) {
        setPinnedMessageId(local.messageId);
        return;
      }
      try {
        const res = await api.get(
          `/api/conversations/${id}/messages/${realMsg.id}/pin`,
        );
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length) {
          const messageId = Number(list[list.length - 1].messageId);
          setPinnedMessageId(messageId);
          savePinnedMessage({ conversationId: Number(id), messageId });
        }
      } catch {
        // not pinned (or not permitted) — banner just stays hidden
      }
    })();
  }, [messages, id]);
  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft("");
    setSending(true);
    try {
      if (replyingMessageId != null) {
        await replyMessage(replyingMessageId, text, id);
        setReplyingMessageId(null);
      } else if (editingMessageId != null) {
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

  const handleMessageInfo = () => {
    if (!selectedMessage) return;
    router.push({
      pathname: `/chat/${id}/info` as any,
      params: {
        messageId: String(selectedMessage.id),
        messageText: selectedMessage.text,
        sentAt: selectedMessage.sentAt ?? "",
        membersJson: JSON.stringify(
          members.filter((m) => m.username !== "You"),
        ),
      },
    });
  };

  const handleReplyMessage = () => {
    if (!selectedMessage) return;
    setReplyingMessageId(selectedMessage.id);
  };

  const handleEdit = () => {
    if (!selectedMessage) return;
    setEditingMessageId(selectedMessage.id);
    setDraft(selectedMessage.text);
  };

  const handlePin = async () => {
    if (!selectedMessage || selectedMessage.id <= 0) return;
    setPinnedMessageId(selectedMessage.id);
    savePinnedMessage({
      conversationId: Number(id),
      messageId: selectedMessage.id,
    });
    try {
      await api.post(
        `/api/conversations/${id}/messages/${selectedMessage.id}/pin`,
      );
    } catch {
      // server may be unreachable — pin is already saved locally
    }
  };

  const navToPinMsg = () => {
    if (pinnedMsg) scrollToMessageRef.current?.(pinnedMsg.id);
  };
  const unPinMsg = async () => {
    if (!pinnedMsg || pinnedMsg.id <= 0) return;
    setPinnedMessageId(null);
    deletePinnedMessageLocal({ conversationId: Number(id) });
    try {
      await api.delete(`/api/conversations/${id}/messages/${pinnedMsg.id}/pin`);
    } catch {
      // banner already cleared locally
    }
  };
  const handleForward = () => {
    if (!selectedMessage) return;
    setMessageToForward(selectedMessage);
    forwardSheetRef.current?.expand();
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

  const replyPreview =
    replyingMessageId != null
      ? messages.find((m) => m.id === replyingMessageId)
      : null;
  const replyPreviewName = replyPreview
    ? currentUserId != null && replyPreview.senderId === currentUserId
      ? "You"
      : (members.find((m) => m.id === replyPreview.senderId)?.username ??
        otherUser?.username ??
        username ??
        `User ${replyPreview.senderId}`)
    : null;

  const pinnedSenderName = pinnedMsg
    ? currentUserId != null && pinnedMsg.senderId === currentUserId
      ? "You"
      : (members.find((m) => m.id === pinnedMsg.senderId)?.username ??
        otherUser?.username ??
        username ??
        `User ${pinnedMsg.senderId}`)
    : undefined;

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
        presence={
          isGroup
            ? `${memberCount} members`
            : formatPresence(otherUser?.lastSeen)
        }
        isOnline={!isGroup && otherUser?.lastSeen === null}
        memberIds={isGroup ? memberIds : undefined}
      />
      {pinnedMsg && (
        <PinnedMessages
          msg={pinnedMsg}
          onPress={navToPinMsg}
          onUnpin={unPinMsg}
          isGroup={isGroup}
          senderName={pinnedSenderName}
          currentUserId={currentUserId}
        />
      )}
      <MessageList
        messages={messages}
        showSkeleton={showSkeleton}
        initialized={initialized}
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
        scrollToMessageRef={scrollToMessageRef}
        otherAvatarUrl={otherUser?.avatarUrl ?? avatarUrl ?? ""}
        otherUsername={otherUser?.username ?? username ?? ""}
        isGroup={isGroup}
        members={members}
      />
      <ChatComposer
        draft={draft}
        editing={editingMessageId != null}
        replying={replyingMessageId != null}
        replyPreview={replyPreview}
        replySenderName={replyPreviewName}
        onDraftChange={(text) => {
          setDraft(text);
          notifyDraftChange();
        }}
        onSend={handleSend}
        onCancelReply={() => {
          setReplyingMessageId(null);
        }}
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
        isGroup={isGroup}
        message={selectedMessage}
        currentUserId={currentUserId}
        position={menuPosition}
        textColor={colors.text}
        bubbleColor={inputBg}
        onEdit={handleEdit}
        onInfo={handleMessageInfo}
        onReply={handleReplyMessage}
        onForward={handleForward}
        onPin={handlePin}
        canPin={!isGroup || isAdmin}
        onDelete={async () => {
          if (!selectedMessage) return;
          try {
            await deleteMessage(selectedMessage.id);
          } finally {
            closeActions();
          }
        }}
        onReact={(emoji) =>
          selectedMessage && reactToMessage(selectedMessage.id, emoji)
        }
        onDismissStart={() => {
          pressProgress.value = withSpring(0, { damping: 28, stiffness: 300 });
        }}
        onClose={closeActions}
      />
      <ForwardSheet
        bottomSheetRef={forwardSheetRef}
        message={messageToForward}
        excludeConversationId={id}
        onDone={() => setMessageToForward(null)}
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

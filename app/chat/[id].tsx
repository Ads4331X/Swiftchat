import { useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { FlatList, View, Text, Pressable, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import Animated, { useSharedValue, withSpring } from "react-native-reanimated";

import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";

import { getCurrentUserId } from "@/lib/auth";
import {
  emitTyping,
  emitStopTyping,
  listenForTyping,
  listenForStopTyping,
} from "@/lib/socket";

import ChatHeader from "@/components/chat/ChatHeader";
import ChatInputBar from "@/components/chat/ChatInputBar";
import MessageList from "@/components/chat/MessageList";
import { MessageActionSheet } from "@/components/chat/MessageActionSheet";
import { getUserPublicKey } from "@/lib/user";
import { generateConversationKey, generateEncryptedKey } from "@/lib/crypto";
import sodium from "libsodium-wrappers";
import { Base64 } from "js-base64";
import { api } from "@/lib/api";

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

  const {
    colors,
    subtleText,
    dividerColor,
    inputBg,
    inputBorderColor,
    placeholderColor,
  } = useTheme();

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    sendMessage,
    deleteMessage,
    editMessage,
    loadMore,
  } = useChatMessages(id, currentUserId);

  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState("");

  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);
  const scrollToEndRef = useRef<(() => void) | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

  const [menuPosition, setMenuPosition] = useState<Position | null>(null);

  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    const chatMembers = memberIds?.split(",").map(Number);
    async function encryptKey() {
      if (!chatMembers) return; // or throw, or handle appropriately
      const conversationKey = await generateConversationKey();
      for (let i = 0; i < chatMembers.length; i++) {
        const publicKey = await api.get(
          `/api/user/${chatMembers[i]}/public-key`,
        );
        const publicKeyToArray8 = Base64.toUint8Array(publicKey.data.publicKey);
        const encryptedKey = await generateEncryptedKey(
          conversationKey,
          publicKeyToArray8,
        );
        const encryptedKeyString = Base64.fromUint8Array(encryptedKey);
        await api.put(`/api/conversations/${id}/key/${chatMembers[i]}`, {
          encryptedKey: encryptedKeyString,
        });
      }
    }
    encryptKey();
  }, []);

  /*
   * Background chat recede animation
   */
  const pressProgress = useSharedValue(0);

  /*
   * Current user
   */
  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  /*
   * Send message
   */
  const handleSend = async () => {
    if (!draft.trim() || sending) {
      return;
    }

    setSending(true);
    try {
      if (editingMessageId) {
        await editMessage(editingMessageId, draft);
        setEditingMessageId(null);
      } else {
        await sendMessage(draft);
      }

      emitStopTyping(Number(id));
      setDraft("");

      // Force-scroll to bottom on send, WhatsApp-style — regardless of
      // where the user currently is scrolled to.
      scrollToEndRef.current?.();
    } finally {
      setSending(false);
    }
  };

  /*
   * Long press
   */
  const handleLongPress = (message: Message, position: Position) => {
    setSelectedMessage(message);
    setMenuPosition(position);

    pressProgress.value = withSpring(1, {
      damping: 22,
      stiffness: 200,
    });
  };

  /*
   * Edit message
   */
  const handleEdit = () => {
    if (!selectedMessage) {
      return;
    }
    setEditingMessageId(selectedMessage.id);

    setDraft(selectedMessage.text);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setDraft("");
  };

  /*
   * Typing indicators — emit when local user types,
   * listen for remote user typing.
   */
  useEffect(() => {
    const subTyping = listenForTyping(({ conversationId, userId }) => {
      if (Number(conversationId) === Number(id) && userId !== currentUserId) {
        setIsOtherUserTyping(true);
      }
    });

    const subStopTyping = listenForStopTyping(({ conversationId, userId }) => {
      if (Number(conversationId) === Number(id) && userId !== currentUserId) {
        setIsOtherUserTyping(false);
      }
    });

    return () => {
      subTyping?.();
      subStopTyping?.();
    };
  }, [id, currentUserId]);

  const handleDraftChange = (text: string) => {
    setDraft(text);

    emitTyping(Number(id));

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      emitStopTyping(Number(id));
    }, 2000);
  };

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top", "left", "right"]}
      style={{
        backgroundColor: colors.background,
      }}
    >
      <ChatHeader
        username={username}
        textColor={colors.text}
        dividerColor={dividerColor}
        backgroundColor={colors.background}
      />

      {/* Messages */}
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
        otherAvatarUrl={avatarUrl ?? ""}
        otherUsername={username ?? ""}
      />

      {/* Editing banner */}
      {editingMessageId && (
        <View
          className="flex-row items-center justify-between px-4 py-2"
          style={{
            backgroundColor: inputBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: dividerColor,
          }}
        >
          <Text style={{ color: subtleText }} className="text-sm flex-1">
            Editing message
          </Text>
          <Pressable onPress={cancelEdit}>
            <Feather name="x" size={18} color={subtleText} />
          </Pressable>
        </View>
      )}

      {/* Input — only this moves with keyboard, header stays fixed */}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
        <ChatInputBar
          draft={draft}
          onDraftChange={handleDraftChange}
          onSend={handleSend}
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
      </KeyboardAvoidingView>

      {/* Message action sheet */}
      <MessageActionSheet
        visible={!!selectedMessage}
        isMine={selectedMessage?.senderId === currentUserId}
        message={selectedMessage?.text ?? ""}
        messageId={selectedMessage?.id ?? 0}
        position={menuPosition}
        textColor={colors.text}
        bubbleColor={inputBg}
        onEdit={handleEdit}
        onDelete={() => {
          if (selectedMessage) {
            deleteMessage(selectedMessage.id);
          }
        }}
        onReply={() => {}}
        onForward={() => {}}
        onPin={() => {}}
        onDismissStart={() => {
          pressProgress.value = withSpring(0, {
            damping: 22,
            stiffness: 200,
          });
        }}
        onClose={() => {
          setSelectedMessage(null);
          setMenuPosition(null);
        }}
      />
    </SafeAreaView>
  );
}

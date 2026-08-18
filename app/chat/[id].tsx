import { useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import {
  Keyboard,
  Platform,
  FlatList,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from "react-native-reanimated";

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

type Position = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

export default function UserChat() {
  const { id, username } = useLocalSearchParams<{
    id: string;
    username?: string;
  }>();

  const {
    colors,
    subtleText,
    dividerColor,
    inputBg,
    inputBorderColor,
    placeholderColor,
  } = useTheme();

  const { messages, loading, sendMessage, deleteMessage, editMessage } =
    useChatMessages(id);

  const insets = useSafeAreaInsets();

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [draft, setDraft] = useState("");

  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

  const [menuPosition, setMenuPosition] = useState<Position | null>(null);

  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  /*
   * Background chat recede animation
   */
  const pressProgress = useSharedValue(0);

  const chatRecedeStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressProgress.value, [0, 1], [1, 0.96]);

    return {
      flex: 1,
      transform: [{ scale }],
    };
  });

  /*
   * Current user
   */
  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  /*
   * Keyboard events
   *
   * We only use these events to scroll the message
   * list. We do NOT use them to move the input.
   *
   * KeyboardAvoidingView handles the actual layout.
   */
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";

    const subShow = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        listRef.current?.scrollToEnd({
          animated: true,
        });
      }, 80);
    });

    return () => {
      subShow.remove();
    };
  }, []);

  /*
   * Send message
   */
  const handleSend = async () => {
    if (!draft.trim() || sending) {
      return;
    }

    try {
      if (editingMessageId) {
        await editMessage(editingMessageId, draft);
        setEditingMessageId(null);
      } else {
        await sendMessage(draft);
      }

      emitStopTyping(Number(id));
      setDraft("");

      setTimeout(() => {
        listRef.current?.scrollToEnd({
          animated: true,
        });
      }, 50);
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
      <KeyboardAvoidingView
        style={{
          flex: 1,
        }}
        behavior="translate-with-padding"
        keyboardVerticalOffset={0}
      >
        <Animated.View style={chatRecedeStyle}>
          {/* Header */}
          <ChatHeader
            username={username}
            isTyping={isOtherUserTyping}
            textColor={colors.text}
            dividerColor={dividerColor}
            backgroundColor={colors.background}
          />

          {/* Messages */}
          <MessageList
            messages={messages}
            loading={loading}
            currentUserId={currentUserId}
            listRef={listRef}
            textColor={colors.text}
            bubbleColor={inputBg}
            subtleText={subtleText}
            selectedMessageId={selectedMessage?.id ?? null}
            onMessageLongPress={handleLongPress}
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
          {/* Input */}
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
            onFocus={() => {
              setTimeout(() => {
                listRef.current?.scrollToEnd({
                  animated: true,
                });
              }, 100);
            }}
          />
        </Animated.View>
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

import { useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { Keyboard, Platform, FlatList } from "react-native";

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

  const { messages, loading, sendMessage, deleteMessage } = useChatMessages(id);

  const insets = useSafeAreaInsets();

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [draft, setDraft] = useState("");

  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<Message>>(null);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  const [menuPosition, setMenuPosition] = useState<Position | null>(null);

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

    setSending(true);

    try {
      await sendMessage(draft);

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

    setDraft(selectedMessage.text);
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

          {/* Input */}
          <ChatInputBar
            draft={draft}
            onDraftChange={setDraft}
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

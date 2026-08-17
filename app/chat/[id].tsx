import { useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  InputAccessoryView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";
import { getCurrentUserId } from "@/lib/auth";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatInputBar, {
  ACCESSORY_ID,
} from "@/components/chat/ChatInputBar";
import MessageList from "@/components/chat/MessageList";

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
  const { messages, loading, sendMessage } = useChatMessages(id);
  const insets = useSafeAreaInsets();
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = () => {
      setKeyboardVisible(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    };
    const onHide = () => setKeyboardVisible(false);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(draft);
      setDraft("");
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top", "left", "right"]}
      style={{ backgroundColor: colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ChatHeader
          username={username}
          textColor={colors.text}
          dividerColor={dividerColor}
          backgroundColor={colors.background}
        />

        <MessageList
          messages={messages}
          loading={loading}
          currentUserId={currentUserId}
          listRef={listRef}
          textColor={colors.text}
          bubbleColor={inputBg}
          subtleText={subtleText}
        />

        {Platform.OS === "ios" && (
          <InputAccessoryView nativeID={ACCESSORY_ID} />
        )}

        <ChatInputBar
          draft={draft}
          onDraftChange={setDraft}
          onSend={handleSend}
          sending={sending}
          keyboardVisible={keyboardVisible}
          insets={insets}
          inputBg={inputBg}
          inputBorderColor={inputBorderColor}
          placeholderColor={placeholderColor}
          textColor={colors.text}
          subtleText={subtleText}
          dividerColor={dividerColor}
          backgroundColor={colors.background}
          onFocus={() =>
            setTimeout(
              () => listRef.current?.scrollToEnd({ animated: true }),
              80,
            )
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

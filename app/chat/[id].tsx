import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  InputAccessoryView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";
import { getCurrentUserId } from "@/lib/auth";

const BRAND_COLOR = "#29A195";

function MessageBubble({
  message,
  isMine,
  textColor,
  bubbleColor,
}: {
  message: Message;
  isMine: boolean;
  textColor: string;
  bubbleColor: string;
}) {
  return (
    <View
      className={`flex-row px-3 py-1 ${isMine ? "justify-end" : "justify-start"}`}
    >
      <View
        className="max-w-[75%] px-3 py-2 rounded-2xl"
        style={{
          backgroundColor: isMine ? BRAND_COLOR : bubbleColor,
          borderBottomRightRadius: isMine ? 4 : 16,
          borderBottomLeftRadius: isMine ? 16 : 4,
        }}
      >
        <Text
          className="text-[15px] leading-5"
          style={{ color: isMine ? "#fff" : textColor }}
        >
          {message.text}
        </Text>
      </View>
    </View>
  );
}

export default function UserChat() {
  const { id, username } = useLocalSearchParams<{
    id: string;
    username?: string;
  }>();
  const router = useRouter();
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
  const ACCESSORY_ID = "chat_input_accessory";
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  // Only used to nudge the list to the end when the keyboard appears/disappears.
  // We do NOT track keyboard height for padding purposes anymore — the input
  // bar is a normal flex sibling of the FlatList, so KeyboardAvoidingView +
  // flexbox already resize the list correctly, WhatsApp-style.
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

  const renderInputBar = () => (
    <View
      className="w-full flex-row items-end gap-3 px-3 py-2"
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
        backgroundColor: colors.background,
        // account for the home indicator / nav bar exactly once, right here —
        // but skip it while the keyboard is open, since the keyboard already
        // covers that area and adding it would create a gap above the keyboard
        paddingBottom: keyboardVisible
          ? 8
          : (insets?.bottom ?? 0) > 0
            ? insets.bottom
            : 8,
      }}
    >
      <Pressable className="p-1 mb-2">
        <Feather name="camera" size={22} color={subtleText} />
      </Pressable>

      <TextInput
        {...(Platform.OS === "ios"
          ? { inputAccessoryViewID: ACCESSORY_ID }
          : {})}
        value={draft}
        onChangeText={setDraft}
        onFocus={() =>
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80)
        }
        placeholder="Message"
        placeholderTextColor={placeholderColor}
        multiline
        className="flex-1 rounded-2xl px-4"
        style={{
          backgroundColor: inputBg,
          color: colors.text,
          borderWidth: 1,
          borderColor: inputBorderColor,
          minHeight: 40,
          maxHeight: 120,
          paddingVertical: 8,
          textAlignVertical: "top",
        }}
      />

      <Pressable className="p-1 mb-2">
        <Feather name="mic" size={22} color={subtleText} />
      </Pressable>

      <Pressable
        onPress={handleSend}
        disabled={sending || !draft.trim()}
        className="w-10 h-10 mb-2 rounded-full items-center justify-center"
        style={{
          backgroundColor: !draft.trim() || sending ? subtleText : BRAND_COLOR,
        }}
      >
        {sending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Feather name="send" size={18} color="#fff" />
        )}
      </Pressable>
    </View>
  );

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
        <View
          className="w-full px-4 py-3 flex-row items-center"
          style={{
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: dividerColor,
          }}
        >
          <Pressable onPress={() => router.back()} className="p-1">
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>

          <Text
            numberOfLines={1}
            style={{ color: colors.text }}
            className="flex-1 text-center font-bold text-lg"
          >
            {username || "Chat"}
          </Text>

          <View className="flex-row items-center gap-4">
            <Pressable>
              <Feather name="phone" size={22} color={BRAND_COLOR} />
            </Pressable>
            <Pressable>
              <Feather name="video" size={24} color={BRAND_COLOR} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={BRAND_COLOR} size="large" />
          </View>
        ) : messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text style={{ color: subtleText }} className="text-base">
              No messages yet
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(message) => String(message.id)}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isMine={item.senderId === currentUserId}
                textColor={colors.text}
                bubbleColor={inputBg}
              />
            )}
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingVertical: 12,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={() =>
              setTimeout(
                () => listRef.current?.scrollToEnd({ animated: true }),
                50,
              )
            }
          />
        )}

        {Platform.OS === "ios" && (
          <InputAccessoryView nativeID={ACCESSORY_ID} />
        )}
        {renderInputBar()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

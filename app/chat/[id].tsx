import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
  LayoutAnimation,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";
import { getToken } from "@/lib/secureStorage";

const BRAND_COLOR = "#29A195";
const INPUT_BAR_HEIGHT = 64;

async function getCurrentUserId(): Promise<number | null> {
  const token = await getToken("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputHeight, setInputHeight] = useState(40);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: any) => {
      const h = e?.endCoordinates?.height ?? 0;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(h);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    };

    const onHide = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(0);
    };

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
      // ensure we scroll to the end after sending to avoid empty space
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, position: "relative" }}>
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
                paddingBottom:
                  Math.max(INPUT_BAR_HEIGHT, inputHeight + 20) +
                  (insets?.bottom ?? 0) +
                  12,
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

          {/* Input bar (stacked below FlatList) */}
          <View
            className="w-full flex-row items-center gap-3 px-3 py-3"
            style={{
              height: Math.max(INPUT_BAR_HEIGHT, inputHeight + 20),
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: dividerColor,
              backgroundColor: colors.background,
              alignItems: "center",
              paddingVertical: 6,
            }}
          >
            <Pressable className="p-1">
              <Feather name="camera" size={22} color={subtleText} />
            </Pressable>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              onFocus={() =>
                setTimeout(
                  () => listRef.current?.scrollToEnd({ animated: true }),
                  80,
                )
              }
              onContentSizeChange={(e) => {
                const h = e.nativeEvent.contentSize.height;
                // include small padding and cap height to avoid overly large input
                const newH = Math.min(200, Math.max(40, Math.round(h + 6)));
                setInputHeight(newH);
              }}
              placeholder="Message"
              placeholderTextColor={placeholderColor}
              multiline
              className="flex-1 rounded-full px-4"
              style={{
                backgroundColor: inputBg,
                color: colors.text,
                borderWidth: 1,
                borderColor: inputBorderColor,
                minHeight: 40,
                height: inputHeight,
                paddingVertical: 8,
                textAlignVertical: "top",
              }}
            />

            <Pressable className="p-1">
              <Feather name="mic" size={22} color={subtleText} />
            </Pressable>

            <Pressable
              onPress={handleSend}
              disabled={sending || !draft.trim()}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{
                backgroundColor:
                  !draft.trim() || sending ? subtleText : BRAND_COLOR,
              }}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Feather name="send" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

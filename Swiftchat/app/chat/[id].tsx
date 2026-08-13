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
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import useChatMessages, { type Message } from "@/hooks/useChatMessages";
import { getToken } from "@/lib/secureStorage";

const BRAND_COLOR = "#29A195";

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
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;

    setSending(true);
    try {
      await sendMessage(draft);
      setDraft("");
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
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
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
            contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        <View
          className="w-full flex-row items-center gap-3 px-3 py-3"
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: dividerColor,
          }}
        >
          <Pressable className="p-1">
            <Feather name="camera" size={22} color={subtleText} />
          </Pressable>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={placeholderColor}
            multiline
            className="flex-1 rounded-full px-4 py-2 max-h-24"
            style={{
              backgroundColor: inputBg,
              color: colors.text,
              borderWidth: 1,
              borderColor: inputBorderColor,
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

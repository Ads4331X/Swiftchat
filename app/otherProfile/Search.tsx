import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";
import { getConversationMemberIds, getMessagesByIds, getUser } from "@/lib/db";
import { Message } from "@/hooks/useChatMessages";
import { searchMessages } from "@/lib/db/search";
import { emitScrollToMessage } from "@/lib/sync/scrollToMessage";
import { decryptMessage, getOrCreateConversationKey } from "@/lib/crypto";
import { getCurrentUserId } from "@/lib/auth";
import { useLocalSearchParams, useRouter } from "expo-router";
import Avatar from "@/components/profile/Avatar";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Search() {
  const { conversationId } = useLocalSearchParams<{
    conversationId: string;
  }>();

  const { colors, inputBg, inputBorderColor, placeholderColor } = useTheme();

  const router = useRouter();

  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[]>([]);

  const [userMap, setUserMap] = useState<
    Record<
      number,
      {
        id: number;
        username: string;
        avatarUrl: string | null;
        localAvatarUrlPath: string | null;
      }
    >
  >({});

  const hasQuery = query.trim().length > 0;

  const clearSearch = () => {
    setQuery("");
    setHasSearched(false);
    setSearching(false);
    setSearchResults([]);
  };

  useEffect(() => {
    if (searchResults.length === 0) return;

    (async () => {
      const senderIds = Array.from(
        new Set(searchResults.map((m) => m.senderId)),
      );

      const loaded = await Promise.all(senderIds.map((id) => getUser(id)));

      const next: typeof userMap = {};

      senderIds.forEach((id, index) => {
        if (loaded[index]) {
          next[id] = loaded[index]!;
        }
      });

      setUserMap(next);
    })();
  }, [searchResults]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    Keyboard.dismiss();

    setHasSearched(true);
    setSearching(true);

    try {
      // 1. Search FTS5
      const indexResults = await searchMessages({
        content: query.trim(),
      });

      const messageIds = indexResults.map((item) => item.rowid);

      if (messageIds.length === 0) {
        setSearchResults([]);
        return;
      }

      // 2. Get actual messages
      const messages: Message[] = await getMessagesByIds({
        messageIds,
      });

      if (messages.length === 0) {
        setSearchResults([]);
        return;
      }

      // 3. Only keep messages from this conversation
      const conversationMessages = messages.filter(
        (msg) => msg.conversationId === Number(conversationId),
      );

      if (conversationMessages.length === 0) {
        setSearchResults([]);
        return;
      }

      // 4. Get current user
      const userId = await getCurrentUserId();

      if (!userId) {
        setSearchResults([]);
        return;
      }

      // 5. Get conversation members
      const memberIds = await getConversationMemberIds(
        Number(conversationId),
        userId,
      );

      if (memberIds.length === 0) {
        setSearchResults([]);
        return;
      }

      // 6. Get conversation key
      const conversationKey = await getOrCreateConversationKey(
        String(conversationId),
        memberIds,
      );

      if (!conversationKey) {
        setSearchResults([]);
        return;
      }

      // 7. Decrypt matching messages
      for (const msg of conversationMessages) {
        const decryptedMsg = await decryptMessage({
          encryptedMessage: msg.text,
          nonce: msg.nonce,
          decryptedConversationKey: conversationKey,
        });

        msg.text = decryptedMsg.decryptMessage;
      }

      // 8. Show results
      setSearchResults(conversationMessages);
    } catch (err) {
      console.warn("Search failed:", err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const navToMsg = async (messageId: number) => {
    emitScrollToMessage(Number(conversationId), Number(messageId));

    const userId = await getCurrentUserId();

    let memberIds = "";

    if (userId) {
      memberIds = (
        await getConversationMemberIds(Number(conversationId), userId)
      ).join(",");
    }

    router.dismissTo({
      pathname: "/chat/[id]",
      params: {
        id: conversationId,
        messageId: String(messageId),
        memberIds,
      },
    });
  };

  const formatSearchDate = (date: string) => {
    const d = new Date(date);

    const formattedDate = d.toISOString().split("T")[0];

    const formattedTime = d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    return {
      date: formattedDate,
      time: formattedTime,
    };
  };

  const highlightMatches = (text: string) => {
    const term = query.trim();

    if (!term || !text) return text;

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const parts = text.split(new RegExp(`(${escaped})`, "i"));

    if (parts.length <= 1) return text;

    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <Text
          key={i}
          style={{
            color: BRAND_COLOR,
            fontWeight: "600",
          }}
        >
          {part}
        </Text>
      ) : (
        part
      ),
    );
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      {/* Header */}
      <View
        className="flex-row items-center gap-2 px-3 pb-3"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: inputBorderColor,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="rounded-full p-1.5"
          style={({ pressed }) => ({
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <View
          className="flex-1 flex-row items-center gap-2 rounded-full px-3.5"
          style={{
            backgroundColor: inputBg,
            borderWidth: 1.5,
            borderColor: isFocused ? BRAND_COLOR : "transparent",
            height: 40,
          }}
        >
          <Feather
            name="search"
            size={17}
            color={isFocused ? BRAND_COLOR : placeholderColor}
          />

          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Search messages"
            placeholderTextColor={placeholderColor}
            autoFocus
            returnKeyType="search"
            blurOnSubmit={false}
            onSubmitEditing={handleSearch}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 15.5,
            }}
          />

          {hasQuery && (
            <Pressable
              onPress={clearSearch}
              hitSlop={10}
              style={({ pressed }) => ({
                opacity: pressed ? 0.5 : 1,
              })}
            >
              <Feather name="x" size={17} color={placeholderColor} />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={handleSearch}
          disabled={!hasQuery}
          hitSlop={8}
          className="px-1"
          style={({ pressed }) => ({
            opacity: !hasQuery ? 0.4 : pressed ? 0.5 : 1,
          })}
        >
          <Text
            style={{ color: BRAND_COLOR }}
            className="font-semibold text-[15px]"
          >
            Search
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 16,
        }}
      >
        {/* Initial state */}
        {!hasSearched && (
          <View className="flex-1 items-center justify-center gap-4 px-12">
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 88,
                height: 88,
                backgroundColor: `${BRAND_COLOR}15`,
              }}
            >
              <Feather name="message-circle" size={34} color={BRAND_COLOR} />
            </View>

            <Text
              style={{ color: colors.text }}
              className="text-center text-[16px] font-semibold"
            >
              Search this conversation
            </Text>

            <Text
              style={{ color: placeholderColor }}
              className="text-center text-[13px] leading-5"
            >
              Find messages, links, and media shared here
            </Text>
          </View>
        )}

        {/* Searching */}
        {hasSearched && searching && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={BRAND_COLOR} />
          </View>
        )}

        {/* No results */}
        {hasSearched && !searching && searchResults.length === 0 && (
          <View className="flex-1 items-center justify-center gap-3 px-12">
            <Feather
              name="search"
              size={40}
              color={placeholderColor}
              style={{ opacity: 0.4 }}
            />

            <Text
              style={{ color: colors.text }}
              className="text-center text-[15px] font-medium"
            >
              No results found
            </Text>

            <Text
              style={{ color: placeholderColor }}
              className="text-center text-[13px] leading-5"
            >
              No messages matching &quot;
              {query}
              &quot;
            </Text>
          </View>
        )}

        {/* Results */}
        {hasSearched &&
          !searching &&
          searchResults.length > 0 &&
          searchResults.map((result) => {
            const user = userMap[result.senderId];

            return (
              <Pressable
                onPress={() => navToMsg(result.id)}
                key={result.id}
                className="mx-4 mt-2 flex-row items-center rounded-xl px-3 py-3"
                style={{
                  backgroundColor: inputBg,
                  borderWidth: 1,
                  borderColor: inputBorderColor,
                }}
              >
                {/* Profile picture */}
                <View
                  className="mr-3 h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: BRAND_COLOR,
                  }}
                >
                  <Avatar
                    username={user?.username ?? `User ${result.senderId}`}
                    avatarUrl={user?.avatarUrl ?? undefined}
                    size={38}
                    userId={Number(result.senderId)}
                    localAvatarUrlPath={user?.localAvatarUrlPath}
                  />
                </View>

                {/* Username + Message */}
                <View className="mr-3 flex-1">
                  <Text
                    style={{ color: colors.icon }}
                    className="text-[12px]"
                    numberOfLines={2}
                  >
                    {user?.username ?? `User ${result.senderId}`}
                  </Text>

                  <Text
                    style={{ color: colors.text }}
                    className="text-[16px]"
                    numberOfLines={2}
                  >
                    {highlightMatches(result.text)}
                  </Text>
                </View>

                {/* Date */}
                <View className="items-end">
                  <Text
                    style={{
                      color: placeholderColor,
                    }}
                    className="text-[11px]"
                  >
                    {formatSearchDate(result.sentAt).date}
                  </Text>

                  <Text
                    style={{
                      color: placeholderColor,
                    }}
                    className="text-[11px]"
                  >
                    {formatSearchDate(result.sentAt).time}
                  </Text>
                </View>
              </Pressable>
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}

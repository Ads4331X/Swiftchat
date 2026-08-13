import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Pressable, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import { Controller, useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";

type FormData = {
  username: string;
};

type SearchResult = {
  type: "success" | "error";
  title: string;
  message?: string;
  username?: string;
};

export default function AddChatMemberForm({
  bottomSheetRef,
}: {
  bottomSheetRef: React.RefObject<React.ElementRef<typeof BottomSheet> | null>;
}) {
  const theme = useTheme();
  const colors = theme.colors;
  const { subtleText, inputBorderColor, inputBg, placeholderColor } = theme;

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: {
      username: "",
    },
  });

  const fieldStyle = {
    borderWidth: 1,
    borderColor: inputBorderColor,
    backgroundColor: inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  };

  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const onSubmit = async (data: FormData) => {
    if (!data.username.trim()) {
      return;
    }

    setResult(null);
    setIsSearching(true);

    try {
      const response = await api.post("/api/conversations/new-conversation", {
        targetUsername: data.username,
      });

      const conversation = response.data.conversation;
      const otherMember = conversation?.members?.find(
        (m: { username?: string }) =>
          m.username?.toLowerCase() !== data.username.trim().toLowerCase(),
      );

      setResult({
        type: "success",
        title: otherMember?.username
          ? `Chat with @${otherMember.username}`
          : "Conversation ready",
        message: response.data.message ?? "You can start chatting now",
        username: otherMember?.username,
      });
    } catch (err: any) {
      setResult({
        type: "error",
        title: "User not found",
        message: err.response?.data?.error ?? "Something went wrong",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const onCancel = () => {
    setResult(null);
    setIsSearching(false);
    inputRef.current?.blur();
    reset();
  };

  const onStartChat = () => {
    inputRef.current?.blur();
    bottomSheetRef.current?.close();
    router.push("/chat");
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={["100%"]}
      topInset={insets.top}
      enableDynamicSizing={false}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.background }}
    >
      <BottomSheetView>
        <View className="flex-row items-center px-4 pt-4 pb-2">
          <Pressable
            onPress={() => {
              inputRef.current?.blur();
              bottomSheetRef.current?.close();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <Text
            style={{ color: colors.text }}
            className="flex-1 text-center text-lg font-semibold"
          >
            New Chat
          </Text>
          <View className="w-6" />
        </View>

        <Text
          style={{ color: subtleText }}
          className="text-sm text-center mb-4"
        >
          Search for a username to start a conversation
        </Text>

        <View className="px-4">
          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, value, onBlur } }) => (
              <View className="flex-row items-center gap-2">
                <View
                  style={{
                    flex: 1,
                    position: "relative",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      left: 16,
                      zIndex: 1,
                    }}
                  >
                    <Feather name="search" size={20} color={subtleText} />
                  </View>

                  <TextInput
                    ref={inputRef}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="web-search"
                    returnKeyType="search"
                    enterKeyHint="search"
                    onSubmitEditing={handleSubmit(onSubmit)}
                    placeholder="Search the username"
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      fieldStyle,
                      {
                        height: 52,
                        paddingLeft: 46,
                        borderRadius: 14,
                      },
                    ]}
                  />
                </View>

                <Pressable
                  onPress={onCancel}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="px-2 py-1 rounded-md active:opacity-60"
                >
                  <Text style={{ color: colors.text }} className="font-medium">
                    Cancel
                  </Text>
                </Pressable>
              </View>
            )}
          />

          {isSearching && (
            <View
              className="mt-4 rounded-2xl border p-4"
              style={{
                borderColor: inputBorderColor,
                backgroundColor: inputBg,
              }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-10 h-10 rounded-full"
                  style={{ backgroundColor: colors.skeletonBg }}
                />
                <View className="flex-1 gap-2">
                  <View
                    className="h-4 w-1/2 rounded"
                    style={{ backgroundColor: colors.skeletonBg }}
                  />
                  <View
                    className="h-3 w-3/4 rounded"
                    style={{ backgroundColor: colors.skeletonBg }}
                  />
                </View>
              </View>
            </View>
          )}

          {result && result.type === "error" && (
            <Text style={{ color: "#EF4444" }} className="mt-4 text-sm">
              {result.message ?? result.title}
            </Text>
          )}

          {result && result.type === "success" && (
            <View
              className="mt-4 rounded-2xl border p-4"
              style={{
                borderColor: "#29A195",
                backgroundColor: "rgba(41, 161, 149, 0.1)",
              }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#29A195" }}
                >
                  <Feather name="user" size={22} color="#FFFFFF" />
                </View>

                <View className="flex-1">
                  <Text
                    style={{ color: colors.text }}
                    className="font-semibold text-base"
                  >
                    {result.title}
                  </Text>
                </View>
              </View>

              <View
                className="flex-row justify-around items-center mt-4 pt-4 border-t"
                style={{ borderTopColor: inputBorderColor }}
              >
                <Pressable
                  onPress={onStartChat}
                  className="items-center gap-1 active:opacity-60"
                >
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#29A195" }}
                  >
                    <Feather name="message-circle" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={{ color: subtleText }} className="text-xs">
                    Chat
                  </Text>
                </Pressable>

                <Pressable className="items-center gap-1 active:opacity-60">
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#25D366" }}
                  >
                    <Feather name="phone" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={{ color: subtleText }} className="text-xs">
                    Call
                  </Text>
                </Pressable>

                <Pressable className="items-center gap-1 active:opacity-60">
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center"
                    style={{ backgroundColor: "#7C3AED" }}
                  >
                    <Feather name="video" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={{ color: subtleText }} className="text-xs">
                    Video
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

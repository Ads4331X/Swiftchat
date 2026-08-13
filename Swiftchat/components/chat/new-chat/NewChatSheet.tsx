import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import { Controller, useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import NewChatSheetHeader from "./NewChatSheetHeader";
import UsernameSearchInput from "./UsernameSearchInput";
import SearchLoadingCard from "./SearchLoadingCard";
import SearchResultCard from "./SearchResultCard";
import type { NewChatResult } from "./types";

type FormData = {
  username: string;
};

type NewChatSheetProps = {
  bottomSheetRef: React.RefObject<React.ElementRef<typeof BottomSheet> | null>;
};

export default function NewChatSheet({ bottomSheetRef }: NewChatSheetProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const { subtleText } = theme;

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: {
      username: "",
    },
  });

  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<NewChatResult | null>(null);
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

  const closeSheet = () => {
    inputRef.current?.blur();
    bottomSheetRef.current?.close();
  };

  const onCancel = () => {
    setResult(null);
    setIsSearching(false);
    inputRef.current?.blur();
    reset();
  };

  const onStartChat = () => {
    closeSheet();
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
        <NewChatSheetHeader onClose={closeSheet} />

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
              <UsernameSearchInput
                ref={inputRef}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onSubmitEditing={handleSubmit(onSubmit)}
                onCancel={onCancel}
              />
            )}
          />

          {isSearching && <SearchLoadingCard />}

          {result && result.type === "error" && (
            <Text style={{ color: "#EF4444" }} className="mt-4 text-sm">
              {result.message ?? result.title}
            </Text>
          )}

          {result && result.type === "success" && (
            <SearchResultCard title={result.title} onChat={onStartChat} />
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

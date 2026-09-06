import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import { Controller, useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import NewChatSheetHeader from "./NewChatSheetHeader";
import UsernameSearchInput from "./UsernameSearchInput";
import SearchLoadingCard from "./SearchLoadingCard";
import SearchResultItem from "./SearchResultItem";
import EmptyState from "@/components/ui/EmptyState";
import { BRAND_COLOR } from "@/constants/theme";

type FormData = {
  username: string;
};

type SearchUser = {
  id: number;
  username: string;
};

type NewChatSheetProps = {
  bottomSheetRef: React.RefObject<React.ElementRef<typeof BottomSheet> | null>;
  onChatCreated?: () => void;
};

export default function NewChatSheet({
  bottomSheetRef,
  onChatCreated,
}: NewChatSheetProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const { subtleText, dividerColor, inputBg } = theme;
  const router = useRouter();

  const { control, handleSubmit, reset } = useForm<FormData>({
    defaultValues: {
      username: "",
    },
  });

  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creatingUsername, setCreatingUsername] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const openNewGroup = () => {
    closeSheet();
    router.push("/group/create");
  };

  const onSubmit = async (data: FormData) => {
    const query = data.username.trim();
    if (!query) {
      return;
    }

    setUsers([]);
    setErrorMessage(null);
    setSearched(true);
    setIsSearching(true);

    try {
      const response = await api.get("/api/user/search", {
        params: { username: query },
      });

      setUsers(response.data.users ?? []);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error ?? "Something went wrong");
    } finally {
      setIsSearching(false);
    }
  };

  const startChat = async (user: SearchUser) => {
    if (creatingUsername) {
      return;
    }

    setCreatingUsername(user.username);
    setErrorMessage(null);

    try {
      const response = await api.post("/api/conversations/new-conversation", {
        targetUsername: user.username,
      });

      const conversation = (response.data as any)?.conversation;
      const currentUserId = await getCurrentUserId();

      const otherMemberIds = (conversation?.members ?? [])
        .map((member: any) => Number(member.userId ?? member.user?.id))
        .filter((memberId: number) => memberId !== currentUserId);

      const memberIds = otherMemberIds.length ? otherMemberIds : [user.id];

      router.push({
        pathname: "/chat/[id]",
        params: {
          id: String(conversation?.id ?? user.id),
          username: user.username,
          memberIds: String(memberIds.join(",")),
        },
      });

      onChatCreated?.();
      closeSheet();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error ?? "Something went wrong");
    } finally {
      setCreatingUsername(null);
    }
  };

  const closeSheet = () => {
    inputRef.current?.blur();
    bottomSheetRef.current?.close();
  };

  const onCancel = () => {
    setUsers([]);
    setIsSearching(false);
    setSearched(false);
    setErrorMessage(null);
    setCreatingUsername(null);
    inputRef.current?.blur();
    reset();
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
        <NewChatSheetHeader
          onClose={closeSheet}
          title="New Chat"
        />

        <Text
          style={{ color: subtleText }}
          className="text-sm text-center mb-4"
        >
          Search for a username to start a conversation
        </Text>

        <Pressable
          onPress={openNewGroup}
            className="flex-row items-center gap-3 mx-4 mb-4 px-4 py-4 active:opacity-60"
            style={{ backgroundColor: inputBg, borderRadius: 14 }}
          >
            <View
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: BRAND_COLOR + "1a" }}
            >
              <Feather name="users" size={20} color={BRAND_COLOR} />
            </View>
            <View className="flex-1">
              <Text
                style={{ color: colors.text }}
                className="font-medium text-base"
              >
                New Group
              </Text>
              <Text style={{ color: subtleText }} className="text-sm">
                Add multiple people
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={subtleText} />
            <View
              className="absolute bottom-0 left-[72px] right-0"
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: dividerColor,
              }}
            />
          </Pressable>

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

          {!isSearching && errorMessage && (
            <Text style={{ color: "#EF4444" }} className="mt-4 text-sm">
              {errorMessage}
            </Text>
          )}

          {!isSearching && !errorMessage && users.length > 0 && (
            <View className="mt-2">
              {users.map((user) => (
                <SearchResultItem
                  key={user.id}
                  username={user.username}
                  loading={creatingUsername === user.username}
                  actionIcon="message-circle"
                  onPress={() => startChat(user)}
                />
              ))}
            </View>
          )}

          {!isSearching && !errorMessage && searched && users.length === 0 && (
            <View className="mt-6">
              <EmptyState
                icon="user-x"
                title="No users found"
                message="Try a different username."
              />
            </View>
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

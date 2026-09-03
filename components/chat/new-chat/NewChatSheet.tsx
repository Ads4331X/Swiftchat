import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/constants/theme-provider";
import { Controller, useForm } from "react-hook-form";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import NewChatSheetHeader from "./NewChatSheetHeader";
import UsernameSearchInput from "./UsernameSearchInput";
import SearchLoadingCard from "./SearchLoadingCard";
import SearchResultItem from "./SearchResultItem";
import EmptyState from "@/components/ui/EmptyState";

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
  const { subtleText } = theme;

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

  const startChat = async (username: string) => {
    if (creatingUsername) {
      return;
    }

    setCreatingUsername(username);
    setErrorMessage(null);

    try {
      await api.post("/api/conversations/new-conversation", {
        targetUsername: username,
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
                  onPress={() => startChat(user.username)}
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

import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import EmptyState from "@/components/ui/EmptyState";
import {
  SelectionCheckbox,
  UserListItem,
} from "@/components/chat/common";
import { SelectedMembersRow } from "./SelectedMembersRow";
import { type MemberSearchUser, type PickedMember } from "./types";

export type { MemberSearchUser, PickedMember } from "./types";

type MemberPickerProps = {
  users: MemberSearchUser[];
  excludeIds?: number[];
  loading?: boolean;
  errorMessage?: string | null;
  onSearch: (query: string) => void;
  onSelectionChange: (selected: PickedMember[]) => void;
};

function MemberPickerSkeleton() {
  const { colors } = useTheme();
  return (
    <>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className="flex-row items-center gap-3 py-3"
          style={{ opacity: 0.6 }}
        >
          <View
            className="w-11 h-11 rounded-full"
            style={{ backgroundColor: colors.skeletonBg }}
          />
          <View
            className="h-4 rounded"
            style={{ width: "50%", backgroundColor: colors.skeletonBg }}
          />
        </View>
      ))}
    </>
  );
}

export default function MemberPicker({
  users,
  excludeIds = [],
  loading = false,
  errorMessage = null,
  onSearch,
  onSelectionChange,
}: MemberPickerProps) {
  const { colors, subtleText, inputBg, inputBorderColor, placeholderColor } =
    useTheme();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickedMember[]>([]);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isSelected = (id: number) => selected.some((m) => m.id === id);

  const toggleMember = (user: MemberSearchUser) => {
    const next = isSelected(user.id)
      ? selected.filter((m) => m.id !== user.id)
      : [
          ...selected,
          {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            localAvatarPath: user.localAvatarPath,
          },
        ];

    setSelected(next);
    onSelectionChange(next);
  };

  const removeMember = (id: number) => {
    setSelected((prev) => {
      const next = prev.filter((m) => m.id !== id);
      onSelectionChange(next);
      return next;
    });
  };

  const onCancel = () => {
    setQuery("");
    setSearched(false);
    inputRef.current?.blur();
  };

  const visibleUsers = users.filter((user) => !excludeIds.includes(user.id));

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2 px-4">
        <View
          className="flex-1"
          style={{ position: "relative", justifyContent: "center" }}
        >
          <View style={{ position: "absolute", left: 16, zIndex: 1 }}>
            <Feather name="search" size={20} color={subtleText} />
          </View>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setSearched(false);
            }}
            keyboardType="web-search"
            returnKeyType="search"
            enterKeyHint="search"
            onSubmitEditing={() => {
              const trimmed = query.trim();
              if (trimmed) {
                setSearched(true);
                onSearch(trimmed);
              }
            }}
            placeholder="Search the username"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              borderWidth: 1,
              borderColor: inputBorderColor,
              backgroundColor: inputBg,
              borderRadius: 14,
              height: 52,
              paddingLeft: 46,
              fontSize: 16,
              color: colors.text,
            }}
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

      <SelectedMembersRow members={selected} onRemove={removeMember} />

      <View className="flex-1 px-4 mt-2">
        {loading && <MemberPickerSkeleton />}

        {!loading && errorMessage && (
          <Text style={{ color: "#EF4444" }} className="mt-4 text-sm">
            {errorMessage}
          </Text>
        )}

        {!loading && !errorMessage && visibleUsers.length > 0 && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {visibleUsers.map((user) => (
              <UserListItem
                key={user.id}
                username={user.username}
                avatarUrl={user.avatar}
                userId={Number(user.id)}
                localAvatarUrlPath={user.localAvatarPath}
                onPress={() => toggleMember(user)}
                trailing={
                  <SelectionCheckbox selected={isSelected(user.id)} />
                }
              />
            ))}
          </ScrollView>
        )}

        {!loading && !errorMessage && visibleUsers.length === 0 && searched && (
          <View className="mt-6">
            <EmptyState
              icon="user-x"
              title="No users found"
              message="Try a different username."
            />
          </View>
        )}

        {!loading && !errorMessage && visibleUsers.length === 0 && !searched && (
          <View className="mt-6">
            <EmptyState
              icon="users"
              title="Add members"
              message="Search for a username and tap to select who you want in the group."
            />
          </View>
        )}
      </View>
    </View>
  );
}

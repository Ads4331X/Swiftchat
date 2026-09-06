import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";
import Avatar from "@/components/profile/Avatar";
import EmptyState from "@/components/ui/EmptyState";

export type MemberSearchUser = {
  id: number;
  username: string;
  avatar?: string;
};

export type PickedMember = {
  id: number;
  username: string;
  avatar?: string;
};

type MemberPickerProps = {
  users: MemberSearchUser[];
  excludeIds?: number[];
  loading?: boolean;
  errorMessage?: string | null;
  onSearch: (query: string) => void;
  onSelectionChange: (selected: PickedMember[]) => void;
};

export default function MemberPicker({
  users,
  excludeIds = [],
  loading = false,
  errorMessage = null,
  onSearch,
  onSelectionChange,
}: MemberPickerProps) {
  const { colors, subtleText, inputBg, inputBorderColor, placeholderColor, dividerColor } =
    useTheme();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PickedMember[]>([]);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isSelected = (id: number) => selected.some((m) => m.id === id);

  const toggleMember = (user: MemberSearchUser) => {
    const next = isSelected(user.id)
      ? selected.filter((m) => m.id !== user.id)
      : [...selected, { id: user.id, username: user.username, avatar: user.avatar }];

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

      {selected.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3 flex-grow-0"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {selected.map((member) => (
            <View key={member.id} className="items-center gap-1">
              <View>
                <Avatar
                  username={member.username}
                  avatarUrl={member.avatar}
                  size={48}
                />
                <Pressable
                  onPress={() => removeMember(member.id)}
                  hitSlop={8}
                  className="absolute -top-1 -right-1 rounded-full items-center justify-center"
                  style={{
                    width: 20,
                    height: 20,
                    backgroundColor: colors.text,
                  }}
                >
                  <Feather name="x" size={12} color={colors.background} />
                </Pressable>
              </View>
              <Text
                numberOfLines={1}
                style={{ color: colors.text, maxWidth: 64 }}
                className="text-xs"
              >
                {member.username}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      <View className="flex-1 px-4 mt-2">
        {loading &&
          [0, 1, 2].map((i) => (
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

        {!loading && errorMessage && (
          <Text style={{ color: "#EF4444" }} className="mt-4 text-sm">
            {errorMessage}
          </Text>
        )}

        {!loading && !errorMessage && visibleUsers.length > 0 && (
          <ScrollView showsVerticalScrollIndicator={false}>
            {visibleUsers.map((user) => {
              const selectedNow = isSelected(user.id);
              return (
                <Pressable
                  key={user.id}
                  onPress={() => toggleMember(user)}
                  className="flex-row items-center gap-3 py-3 active:opacity-60"
                >
                  <Avatar
                    username={user.username}
                    avatarUrl={user.avatar}
                    size={44}
                  />
                  <View className="flex-1">
                    <Text
                      style={{ color: colors.text }}
                      className="font-medium text-base"
                    >
                      {user.username}
                    </Text>
                  </View>
                  <View
                    className="items-center justify-center rounded-full"
                    style={{
                      width: 22,
                      height: 22,
                      borderWidth: 2,
                      borderColor: selectedNow
                        ? BRAND_COLOR
                        : subtleText + "66",
                      backgroundColor: selectedNow
                        ? BRAND_COLOR
                        : "transparent",
                    }}
                  >
                    {selectedNow && (
                      <Feather name="check" size={14} color="#fff" />
                    )}
                  </View>
                  <View
                    className="absolute bottom-0 right-0"
                    style={{
                      left: 56,
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: dividerColor,
                    }}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!loading &&
          !errorMessage &&
          visibleUsers.length === 0 &&
          searched && (
            <View className="mt-6">
              <EmptyState
                icon="user-x"
                title="No users found"
                message="Try a different username."
              />
            </View>
          )}

        {!loading &&
          !errorMessage &&
          visibleUsers.length === 0 &&
          !searched && (
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
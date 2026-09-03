import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";
import { api } from "@/lib/api";
import Avatar from "@/components/profile/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import { joinConversation } from "@/lib/socket";

type SearchUser = {
  id: number;
  username: string;
  avatar?: string;
};

type SelectedMember = {
  id: number;
  username: string;
  avatar?: string;
};

export default function CreateGroup() {
  const router = useRouter();
  const theme = useTheme();
  const colors = theme.colors;
  const {
    subtleText,
    inputBg,
    inputBorderColor,
    placeholderColor,
    dividerColor,
  } = theme;

  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedMember[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const nameInputRef = useRef<TextInput>(null);

  const goBack = () => {
    if (step === 2) {
      setErrorMessage(null);
      setStep(1);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const isSelected = (id: number) => selected.some((m) => m.id === id);

  const toggleMember = (user: SearchUser) => {
    setSelected((prev) =>
      isSelected(user.id)
        ? prev.filter((m) => m.id !== user.id)
        : [...prev, { id: user.id, username: user.username, avatar: user.avatar }],
    );
  };

  const removeMember = (id: number) => {
    setSelected((prev) => prev.filter((m) => m.id !== id));
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setUsers([]);
    setErrorMessage(null);
    setIsSearching(true);
    try {
      const response = await api.get("/api/user/search", {
        params: { username: q },
      });
      setUsers(response.data.users ?? []);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error ?? "Something went wrong");
    } finally {
      setIsSearching(false);
    }
  };

  const onCancel = () => {
    setQuery("");
    setUsers([]);
    setErrorMessage(null);
    inputRef.current?.blur();
  };

  const goNext = () => {
    if (selected.length < 1) return;
    setStep(2);
  };

  const canCreate = name.trim().length > 0 && !creating && selected.length > 0;

  const onCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    setErrorMessage(null);
    try {
      const membersId = selected.map((m) => String(m.id));
      const response = await api.post("/api/conversations/group", {
        name: name.trim(),
        membersId,
      });
      const group = response.data;
      const groupId = group?.id ? String(group.id) : "";

      joinConversation({ id: groupId || membersId.join(",") });

      router.replace({
        pathname: "/chat/[id]",
        params: {
          id: groupId,
          username: name.trim(),
          avatarUrl: "",
          memberIds: membersId.join(","),
        },
      });
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.error ?? "Couldn't create group — try again",
      );
      setCreating(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <View className="flex-row items-center px-2 pt-3">
        <Pressable onPress={goBack} hitSlop={10} className="p-2">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{ color: colors.text }}
          className="flex-1 text-center text-lg font-semibold"
        >
          New Group
        </Text>
        <Text style={{ color: subtleText }} className="text-sm px-4">
          {step} of 2
        </Text>
      </View>

      {step === 1 ? (
        <>
          <Text style={{ color: subtleText }} className="text-center text-sm mt-1 mb-4">
            Select people to add
          </Text>

          <View className="flex-row items-center gap-2 px-4">
            <View style={{ flex: 1, position: "relative", justifyContent: "center" }}>
              <View style={{ position: "absolute", left: 16, zIndex: 1 }}>
                <Feather name="search" size={20} color={subtleText} />
              </View>
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                keyboardType="web-search"
                returnKeyType="search"
                enterKeyHint="search"
                onSubmitEditing={onSearch}
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
                    <Avatar username={member.username} avatarUrl={member.avatar} size={48} />
                    <Pressable
                      onPress={() => removeMember(member.id)}
                      hitSlop={8}
                      className="absolute -top-1 -right-1 rounded-full items-center justify-center"
                      style={{ width: 20, height: 20, backgroundColor: colors.text }}
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
            {isSearching &&
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

            {!isSearching && errorMessage && (
              <Text style={{ color: "#EF4444" }} className="mt-4 text-sm">
                {errorMessage}
              </Text>
            )}

            {!isSearching && !errorMessage && users.length > 0 && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {users.map((user) => {
                  const selectedNow = isSelected(user.id);
                  return (
                    <Pressable
                      key={user.id}
                      onPress={() => toggleMember(user)}
                      className="flex-row items-center gap-3 py-3 active:opacity-60"
                    >
                      <Avatar username={user.username} avatarUrl={user.avatar} size={44} />
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
                          borderColor: selectedNow ? BRAND_COLOR : subtleText + "66",
                          backgroundColor: selectedNow ? BRAND_COLOR : "transparent",
                        }}
                      >
                        {selectedNow && <Feather name="check" size={14} color="#fff" />}
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

            {!isSearching && !errorMessage && users.length === 0 && query.trim() !== "" && (
              <View className="mt-6">
                <EmptyState
                  icon="user-x"
                  title="No users found"
                  message="Try a different username."
                />
              </View>
            )}

            {!isSearching && !errorMessage && users.length === 0 && query.trim() === "" && (
              <View className="mt-6">
                <EmptyState
                  icon="users"
                  title="Add members"
                  message="Search for a username and tap to select who you want in the group."
                />
              </View>
            )}
          </View>

          <View
            className="px-4 pt-3 pb-4"
            style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dividerColor }}
          >
            <Pressable
              onPress={goNext}
              disabled={selected.length < 1}
              className="h-[52px] rounded-xl items-center justify-center active:opacity-80"
              style={{
                backgroundColor: selected.length < 1 ? subtleText + "40" : BRAND_COLOR,
                opacity: selected.length < 1 ? 0.6 : 1,
              }}
            >
              <Text
                style={{ color: selected.length < 1 ? subtleText : "#fff" }}
                className="font-semibold text-base"
              >
                {selected.length > 0 ? `Next (${selected.length})` : "Next"}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              alignItems: "center",
              paddingHorizontal: 32,
              paddingTop: 24,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              className="items-center justify-center rounded-full border-2 border-dashed"
              style={{
                width: 96,
                height: 96,
                borderColor: BRAND_COLOR,
                backgroundColor: BRAND_COLOR + "14",
              }}
              disabled
            >
              <Feather name="camera" size={28} color={BRAND_COLOR} />
            </Pressable>

            <TextInput
              ref={nameInputRef}
              value={name}
              onChangeText={setName}
              autoFocus
              placeholder="Group name"
              placeholderTextColor={placeholderColor}
              maxLength={50}
              style={{
                alignSelf: "stretch",
                marginTop: 24,
                borderWidth: 1,
                borderColor: inputBorderColor,
                backgroundColor: inputBg,
                borderRadius: 14,
                height: 52,
                paddingHorizontal: 16,
                fontSize: 16,
                color: colors.text,
                textAlign: "center",
              }}
            />

            <Text style={{ color: subtleText }} className="mt-2 text-sm">
              {name.length}/50
            </Text>

            {selected.length > 0 && (
              <View className="self-stretch mt-6">
                <Text
                  style={{ color: subtleText }}
                  className="text-xs font-semibold uppercase tracking-wide mb-2"
                >
                  Members ({selected.length})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-3">
                    {selected.map((member) => (
                      <View key={member.id} className="items-center gap-1">
                        <Avatar username={member.username} avatarUrl={member.avatar} size={48} />
                        <Text
                          numberOfLines={1}
                          style={{ color: colors.text, maxWidth: 64 }}
                          className="text-xs"
                        >
                          {member.username}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </ScrollView>

          <View
            className="px-4 pt-3 pb-4"
            style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: dividerColor }}
          >
            {errorMessage != null && (
              <Text style={{ color: "#EF4444" }} className="text-sm text-center mb-2">
                {errorMessage}
              </Text>
            )}
            <Pressable
              onPress={onCreate}
              disabled={!canCreate}
              className="h-[52px] rounded-xl items-center justify-center active:opacity-80"
              style={{
                backgroundColor: canCreate ? BRAND_COLOR : subtleText + "40",
                opacity: canCreate ? 1 : 0.6,
              }}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{ color: canCreate ? "#fff" : subtleText }}
                  className="font-semibold text-base"
                >
                  Create
                </Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

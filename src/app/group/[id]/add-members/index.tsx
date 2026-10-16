import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/shared/providers/theme-provider";
import { BRAND_COLOR } from "@/shared/theme/theme";
import MemberPicker, {
  MemberSearchUser,
  PickedMember,
} from "@/features/groups/components";
import { api } from "@/core/api";
import { shareConversationKeyWithMembers } from "@/core/crypto";

export default function AddMembers() {
  const { id, memberIds } = useLocalSearchParams<{
    id: string;
    memberIds?: string;
  }>();
  const router = useRouter();
  const [users, setUsers] = useState<MemberSearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { colors, subtleText, dividerColor } = useTheme();
  const [selected, setSelected] = useState<PickedMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const excludeIds = (memberIds ?? "").split(",").filter(Boolean).map(Number);

  const addCount = selected.length;

  const onAdd = async () => {
    if (addCount < 1 || submitting) return;
    setSubmitting(true);
    setAddError(null);
    try {
      await api.post(`/api/conversations/${id}/members`, {
        userIds: selected.map((m) => m.id),
      });

      try {
        await shareConversationKeyWithMembers({
          conversationId: id,
          memberIds: [...excludeIds, ...selected.map((m) => m.id)],
        });
      } catch {
      }

      router.back();
    } catch (err: any) {
      setAddError(err.response?.data?.error ?? "Failed to add members");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <View className="flex-row items-center px-2 pt-3">
        <Pressable onPress={() => router.back()} hitSlop={10} className="p-2">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{ color: colors.text }}
          className="flex-1 text-center text-lg font-semibold"
        >
          Add members
        </Text>
        <View className="w-10" />
      </View>

      <Text
        style={{ color: subtleText }}
        className="text-center text-sm mt-1 mb-2"
      >
        Select people to add to this chat
      </Text>

      <MemberPicker
        users={users}
        excludeIds={excludeIds}
        loading={isSearching}
        errorMessage={errorMessage}
        onSearch={async (query) => {
          setUsers([]);
          setErrorMessage(null);
          setIsSearching(true);
          try {
            const result = await api.get("/api/user/search", {
              params: { username: query },
            });
            setUsers(result.data.users ?? []);
          } catch (err: any) {
            setErrorMessage(
              err.response?.data?.error ?? "Something went wrong",
            );
          } finally {
            setIsSearching(false);
          }
        }}
        onSelectionChange={setSelected}
      />

      <View
        className="px-4 pt-3 pb-4"
        style={{
          borderTopWidth: 1,
          borderTopColor: dividerColor,
        }}
      >
        {addError != null && (
          <Text
            style={{ color: "#EF4444" }}
            className="text-sm text-center mb-2"
          >
            {addError}
          </Text>
        )}
        <Pressable
          disabled={addCount < 1 || submitting}
          className="h-[52px] rounded-xl items-center justify-center active:opacity-80"
          style={{
            backgroundColor: addCount < 1 ? subtleText + "40" : BRAND_COLOR,
            opacity: addCount < 1 || submitting ? 0.6 : 1,
          }}
          onPress={onAdd}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={{ color: addCount < 1 ? subtleText : "#fff" }}
              className="font-semibold text-base"
            >
              {addCount > 0 ? `Add (${addCount})` : "Add"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

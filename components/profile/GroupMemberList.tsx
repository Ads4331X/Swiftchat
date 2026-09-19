import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";
import Avatar from "@/components/profile/Avatar";
import Badge from "@/components/ui/Badge";

export type GroupMember = {
  id: number;
  username: string;
  avatar?: string;
};

type GroupMemberListProps = {
  members: GroupMember[];
  memberCount: number;
  myId?: number;
  myName: string;
  adminId: number | null;
  canRemove: boolean;
  showAll: boolean;
  maxVisible?: number;
  onToggleShowAll: () => void;
  onOpen: (memberId: number) => void;
  onRemove: (member: GroupMember) => void;
};

export default function GroupMemberList({
  members,
  memberCount,
  myId,
  myName,
  adminId,
  canRemove,
  showAll,
  maxVisible = 5,
  onToggleShowAll,
  onOpen,
  onRemove,
}: GroupMemberListProps) {
  const { colors } = useTheme();
  const faint = colors.text + "1f";
  const visibleMembers = showAll ? members : members.slice(0, maxVisible);

  return (
    <View className="mt-7">
      <Text
        style={{ color: BRAND_COLOR + "cc" }}
        className="text-xs font-semibold uppercase tracking-wide px-5 mb-1.5"
      >
        Members ({memberCount})
      </Text>
      {visibleMembers.map((member) => (
        <View key={member.id} className="flex-row items-center px-5 py-2">
          <Pressable
            disabled={member.id === myId}
            onPress={() => {
              if (member.id !== myId) onOpen(member.id);
            }}
            className="flex-1 flex-row items-center py-1"
            style={({ pressed }) => ({
              backgroundColor: pressed ? faint : "transparent",
            })}
          >
            <Avatar
              username={member.id === myId ? myName : member.username}
              avatarUrl={member.avatar}
              size={40}
              userId={Number(member.id)}
            />
            <Text
              style={{ color: colors.text }}
              className="flex-1 text-[15px] ml-4"
            >
              {member.username}
            </Text>
            {member.id === adminId && (
              <Badge
                label="admin"
                color={BRAND_COLOR}
                backgroundColor={BRAND_COLOR + "22"}
              />
            )}
          </Pressable>
          {member.id !== myId && (
            <Pressable
              disabled={!canRemove}
              onPress={() => onRemove(member)}
              hitSlop={10}
              className="p-2"
              style={{ opacity: canRemove ? 1 : 0.3 }}
            >
              <Feather name="user-minus" size={18} color="#E5484D" />
            </Pressable>
          )}
        </View>
      ))}
      {members.length > maxVisible && (
        <Pressable
          onPress={onToggleShowAll}
          className="flex-row items-center px-5 py-3"
          style={({ pressed }) => ({
            backgroundColor: pressed ? faint : "transparent",
          })}
        >
          <Text
            style={{ color: BRAND_COLOR }}
            className="text-[15px] font-medium"
          >
            {showAll ? "Show less" : `See all ${memberCount} members`}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

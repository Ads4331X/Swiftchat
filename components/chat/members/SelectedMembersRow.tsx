import { Pressable, ScrollView, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import Avatar from "@/components/profile/Avatar";
import { type PickedMember } from "./types";

type SelectedMembersRowProps = {
  members: PickedMember[];
  onRemove: (id: number) => void;
};

export function SelectedMembersRow({
  members,
  onRemove,
}: SelectedMembersRowProps) {
  const { colors } = useTheme();

  if (members.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-3 flex-grow-0"
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
    >
      {members.map((member) => (
        <View key={member.id} className="items-center gap-1">
          <View>
            <Avatar
              username={member.username}
              avatarUrl={member.avatar}
              size={48}
              userId={Number(member.id)}
              localAvatarUrlPath={member.localAvatarPath}
            />
            <Pressable
              onPress={() => onRemove(member.id)}
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
  );
}

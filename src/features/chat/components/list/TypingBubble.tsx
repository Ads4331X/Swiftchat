import { Text, View } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";
import Avatar from "@/features/profile/components/Avatar";
import { TypingIndicator } from "@/features/chat/components/common";

type TypingBubbleProps = {
  members: { id: number; username: string; avatar?: string }[];
  text: string;
};

export function TypingBubble({ members, text }: TypingBubbleProps) {
  const { inputBg, subtleText } = useTheme();

  return (
    <View className="flex-row justify-start px-1 py-[1px] mt-1">
      <View
        className="px-3 py-2 rounded-2xl"
        style={{
          backgroundColor: inputBg,
          borderBottomLeftRadius: 4,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View className="flex-row">
          {members.map((member, index) => (
            <View
              key={member.id}
              className="rounded-full"
              style={{
                borderWidth: 2,
                borderColor: inputBg,
                marginLeft: index === 0 ? 0 : -8,
              }}
            >
              <Avatar
                username={member.username}
                avatarUrl={member.avatar}
                size={24}
                localAvatarUrlPath={null}
              />
            </View>
          ))}
        </View>
        <Text style={{ color: subtleText }} className="text-sm">
          {text}
        </Text>
        <TypingIndicator color={subtleText} />
      </View>
    </View>
  );
}

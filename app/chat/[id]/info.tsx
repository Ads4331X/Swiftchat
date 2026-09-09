import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useTheme } from "@/constants/theme-provider";
import { MessageBubbleContent } from "@/components/chat/MessageBubble";
import Avatar from "@/components/profile/Avatar";

type Member = {
  id: number;
  name: string;
  avatar?: string;
  time?: string;
};

const message = {
  text: "Hey, are we still meeting at 7?",
  time: "6:42 PM",
};

const readBy: Member[] = [
  { id: 1, name: "Alice", time: "6:43 PM" },
  { id: 2, name: "Bob", time: "6:44 PM" },
  { id: 3, name: "Sarah", time: "6:45 PM" },
];

const deliveredTo: Member[] = [
  { id: 4, name: "Charlie" },
  { id: 5, name: "David" },
];

function SectionTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{ color: colors.text }}
      className="text-lg font-bold mt-6 mb-3"
    >
      {title}
    </Text>
  );
}

function MemberRows({ members }: { members: Member[] }) {
  const { colors, subtleText, dividerColor } = useTheme();

  if (members.length === 0) {
    return (
      <Text style={{ color: subtleText }}>No one has read this message yet</Text>
    );
  }

  return (
    <View>
      {members.map((m, index) => (
        <View
          key={m.id}
          className="flex-row items-center py-3"
          style={{
            borderBottomWidth:
              index < members.length - 1 ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: dividerColor,
          }}
        >
          <Avatar username={m.name} avatarUrl={m.avatar} size={40} />
          <Text
            style={{ color: colors.text }}
            className="flex-1 ml-3 text-[15px]"
          >
            {m.name}
          </Text>
          {m.time && (
            <Text style={{ color: subtleText }} className="text-[13px]">
              {m.time}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export default function MessageInfoScreen() {
  const router = useRouter();
  const { colors, subtleText, dividerColor, inputBg } = useTheme();

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <View
        className="w-full px-4 py-3 flex-row items-center"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: dividerColor,
        }}
      >
        <Pressable onPress={() => router.back()} className="p-1">
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text
          style={{ color: colors.text }}
          className="flex-1 text-center font-bold text-lg"
        >
          Message Info
        </Text>
        <View className="w-8" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        <View className="items-center mt-6 mb-2">
          <MessageBubbleContent
            text={message.text}
            isMine
            textColor={colors.text}
            bubbleColor={inputBg}
            subtleText={subtleText}
          />
          <Text style={{ color: subtleText }} className="text-[11px] mt-1">
            {message.time}
          </Text>
        </View>

        <SectionTitle title="Read by" />
        <MemberRows members={readBy} />

        <SectionTitle title="Delivered to" />
        <MemberRows members={deliveredTo} />
      </ScrollView>
    </SafeAreaView>
  );
}

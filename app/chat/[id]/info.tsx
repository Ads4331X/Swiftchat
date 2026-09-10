import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "@/constants/theme-provider";
import { api } from "@/lib/api";
import { MessageBubbleContent } from "@/components/chat/MessageBubble";
import Avatar from "@/components/profile/Avatar";

type Member = {
  id: number;
  name: string;
  avatar?: string;
  time?: string;
};

function formatTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SectionTitle({
  title,
  variant,
  count,
}: {
  title: string;
  variant: "read" | "delivered";
  count: number;
}) {
  const { colors, subtleText } = useTheme();
  const tickColor = variant === "read" ? "#53BDEB" : subtleText;

  return (
    <View className="flex-row items-center mt-6 mb-3">
      <View className="flex-row items-end" style={{ width: 18, height: 11 }}>
        <Feather
          name="check"
          size={11}
          color={tickColor}
          style={{ opacity: 0.85, marginRight: -2 }}
        />
        <Feather name="check" size={11} color={tickColor} />
      </View>
      <Text
        style={{ color: colors.text }}
        className="text-[15px] font-bold ml-2"
      >
        {title}
      </Text>
      {count > 0 && (
        <Text style={{ color: subtleText }} className="ml-1.5 text-[13px]">
          {count}
        </Text>
      )}
    </View>
  );
}

function MemberRows({
  members,
  emptyText,
}: {
  members: Member[];
  emptyText: string;
}) {
  const { colors, subtleText, dividerColor } = useTheme();

  if (members.length === 0) {
    return (
      <Text style={{ color: subtleText }} className="text-[14px] pb-1">
        {emptyText}
      </Text>
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
  const { id, messageId, messageText, sentAt, membersJson } =
    useLocalSearchParams<{
      id: string;
      messageId: string;
      messageText: string;
      sentAt: string;
      membersJson: string;
    }>();
  const { colors, subtleText, dividerColor, inputBg } = useTheme();

  const [readBy, setReadBy] = useState<Member[]>([]);
  const [deliveredTo, setDeliveredTo] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !messageId) return;

    let active = true;

    api
      .get(`/api/conversations/${id}/messages/${messageId}/read-status`)
      .then((res) => {
        if (!active) return;

        const readMembers: Member[] = res.data.map((u: any) => ({
          id: u.id,
          name: u.username,
          avatar: u.avatar,
        }));
        setReadBy(readMembers);

        const allMembers: { id: number; username: string; avatar?: string }[] =
          membersJson ? JSON.parse(membersJson) : [];
        const readIds = new Set(readMembers.map((m) => m.id));
        const delivered: Member[] = allMembers
          .filter((m) => !readIds.has(m.id))
          .map((m) => ({ id: m.id, name: m.username, avatar: m.avatar }));
        setDeliveredTo(delivered);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, messageId, membersJson]);

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
        <View className="items-end mt-6 mb-2 pr-1">
          <MessageBubbleContent
            text={messageText ?? ""}
            isMine
            textColor={colors.text}
            bubbleColor={inputBg}
            subtleText={subtleText}
          />
          <Text style={{ color: subtleText }} className="text-[11px] mt-1 mr-1">
            {formatTime(sentAt ?? "")}
          </Text>
        </View>

        {loading ? (
          <Text style={{ color: subtleText }} className="mt-8 text-center">
            Loading...
          </Text>
        ) : (
          <>
            <SectionTitle
              title="Read by"
              variant="read"
              count={readBy.length}
            />
            <MemberRows
              members={readBy}
              emptyText="No one has read this message yet"
            />

            <SectionTitle
              title="Delivered to"
              variant="delivered"
              count={deliveredTo.length}
            />
            <MemberRows
              members={deliveredTo}
              emptyText="No one else has this message pending delivery"
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

import { Animated, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { type RepliedTo } from "@/features/chat/hooks/useChatMessages";
import { BRAND_COLOR } from "@/shared/theme/theme";
import { useTheme } from "@/shared/providers/theme-provider";
import { useEffect, useRef } from "react";
import { ReadReceipts } from "@/features/chat/components/common";
import { RepliedToQuote } from "@/features/chat/components/message/RepliedToQuote";
import { formatBubbleTime, READ_TICK_COLOR } from "@/features/chat/components/message/utils";

export type MessageBubbleContentProps = {
  text: string;
  isMine: boolean;
  editedAt?: string;
  sentAt?: string;
  isPending?: boolean;
  isRead?: boolean;
  hasAnyoneRead?: boolean;
  hasEveryoneRead?: boolean;
  isGroup?: boolean;
  repliedTo?: RepliedTo;
  replyToId?: number;
  forwardedFromMsgId?: number;
  onQuotePress?: (messageId: number) => void;
  highlighted?: boolean;
};

export function MessageBubbleContent({
  text,
  isMine,
  editedAt,
  sentAt,
  isPending,
  isRead,
  hasAnyoneRead,
  hasEveryoneRead,
  isGroup = false,
  repliedTo,
  replyToId,
  onQuotePress,
  highlighted,
  forwardedFromMsgId,
}: MessageBubbleContentProps) {
  const { colors, inputBg, subtleText } = useTheme();

  const wasEdited =
    editedAt &&
    sentAt &&
    new Date(editedAt).getTime() > new Date(sentAt).getTime();

  const tickColor = isMine ? "rgba(255,255,255,0.55)" : subtleText;

  const glowOpacity = useRef(new Animated.Value(0)).current;
  const landScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!highlighted) return;
    landScale.setValue(0.97);
    const anim = Animated.parallel([
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(550),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(landScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
        bounciness: 8,
      }),
    ]);
    anim.start();
    return () => {
      anim.stop();
      glowOpacity.setValue(0);
      landScale.setValue(1);
    };
  }, [highlighted, glowOpacity, landScale]);

  return (
    <Animated.View style={{ transform: [{ scale: landScale }] }}>
      <View>
        {forwardedFromMsgId && (
          <View
            className="flex-row items-center"
            style={{ paddingHorizontal: 12, paddingBottom: 2 }}
          >
            <Feather
              name="arrow-right"
              size={12}
              color={isMine ? "rgba(255,255,255,0.85)" : subtleText}
              style={{ marginRight: 6 }}
            />
            <Text
              className="text-xs font-semibold"
              style={{
                color: isMine ? "rgba(255,255,255,0.85)" : subtleText,
              }}
            >
              Forwarded
            </Text>
          </View>
        )}
        {repliedTo && (
          <RepliedToQuote
            repliedTo={repliedTo}
            replyToId={replyToId}
            isMine={isMine}
            isGroup={isGroup}
            onQuotePress={onQuotePress}
          />
        )}
        <View
          className={`max-w-[100%] px-3 pt-2 pb-1 ${
            repliedTo ? "" : "rounded-[18px]"
          }`}
          style={{
            backgroundColor: isMine ? BRAND_COLOR : inputBg,
            borderBottomRightRadius: isMine ? 4 : 18,
            borderBottomLeftRadius: isMine ? 18 : 4,
            overflow: "hidden",
          }}
        >
          <Text
            className="text-[15px] leading-[20px]"
            style={{
              color: isMine ? "#fff" : colors.text,
              flexShrink: 1,
            }}
          >
            {text}
          </Text>

          <View className="flex-row items-center self-end pt-[2px] ml-4">
            {wasEdited && !isPending && (
              <Text
                className="text-[10px]"
                style={{ color: tickColor, marginRight: 6 }}
              >
                Edited
              </Text>
            )}
            {sentAt && (
              <Text
                className="text-[10px]"
                style={{ color: tickColor, marginRight: isMine ? 3 : 0 }}
              >
                {isPending ? "Sending…" : formatBubbleTime(sentAt)}
              </Text>
            )}
            {isMine && (
              <ReadReceipts
                isPending={!!isPending}
                isRead={!!isRead}
                color={isMine && hasEveryoneRead ? READ_TICK_COLOR : tickColor}
                hasAnyoneRead={hasAnyoneRead}
                hasEveryoneRead={hasEveryoneRead}
                isGroup={isGroup}
              />
            )}
          </View>
          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: 18,
              borderWidth: 1.5,
              borderColor: isMine ? "rgba(255,255,255,0.7)" : BRAND_COLOR,
              opacity: glowOpacity,
            }}
          />
        </View>
      </View>
    </Animated.View>
  );
}

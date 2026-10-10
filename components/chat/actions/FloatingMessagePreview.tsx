import { useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { MessageBubbleContent, ReactionChips } from "@/components/chat/message";
import { type Position } from "@/components/chat/types";
import { type Message } from "@/types/message";
import { FLOAT_GAP, SCREEN } from "./constants";

type FloatingMessagePreviewProps = {
  message: Message | null;
  isMine: boolean;
  isGroup: boolean;
  position: Position;
  hasReactions: boolean;
  truncated: boolean;
  copyHeight: number;
};

export function FloatingMessagePreview({
  message,
  isMine,
  isGroup,
  position,
  hasReactions,
  truncated,
  copyHeight,
}: FloatingMessagePreviewProps) {
  const copyScrollY = useSharedValue(0);
  const copyScrollContentH = useSharedValue(0);
  const copyScrollRef = useRef<ScrollView>(null);

  const moreHintStyle = useAnimatedStyle(() => {
    const maxOffset = Math.max(copyScrollContentH.value - copyHeight, 0);
    const nearEnd =
      copyScrollContentH.value <= 0 ||
      copyScrollY.value >= maxOffset - 20;
    return { opacity: nearEnd ? 0 : 1 };
  });

  const content = (
    <MessageBubbleContent
      text={message?.text ?? ""}
      isMine={isMine}
      editedAt={message?.editedAt ?? undefined}
      sentAt={message?.sentAt}
      isPending={(message?.id ?? 0) < 0}
      isGroup={isGroup}
      repliedTo={message?.repliedTo}
      replyToId={message?.replyToId}
      forwardedFromMsgId={message?.forwardedFromMsgId}
    />
  );

  return (
    <View
      pointerEvents="none"
      style={{
        width: "100%",
        alignItems: isMine ? "flex-end" : "flex-start",
        marginBottom: FLOAT_GAP,
      }}
    >
      <Animated.View
        style={[
          {
            maxWidth: "80%",
            marginLeft: isMine ? undefined : position.pageX,
            marginRight: isMine
              ? SCREEN.width - position.pageX - position.width
              : undefined,
            marginBottom: hasReactions ? 14 : 0,
            shadowColor: "#000",
            shadowOpacity: 0.3,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
            elevation: 16,
            ...(truncated ? { height: copyHeight } : {}),
          },
        ]}
      >
        {truncated ? (
          <ScrollView
            ref={copyScrollRef}
            style={{ flex: 1 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              copyScrollY.value = e.nativeEvent.contentOffset.y;
              copyScrollContentH.value = e.nativeEvent.contentSize.height;
            }}
            onContentSizeChange={(_w, h) => {
              copyScrollContentH.value = h;
            }}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}

        {truncated ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: "absolute",
                alignSelf: "center",
                bottom: hasReactions ? 48 : 8,
              },
              moreHintStyle,
            ]}
          >
            <Pressable
              onPress={() => copyScrollRef.current?.scrollToEnd({ animated: true })}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 14,
                backgroundColor: "rgba(20,20,20,0.5)",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
                … More
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <ReactionChips reactions={message?.reactions} isMine={isMine} />
      </Animated.View>
    </View>
  );
}

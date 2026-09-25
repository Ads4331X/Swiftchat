import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Modal,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  runOnJS,
  Easing as REasing,
  type SharedValue,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Feather from "@expo/vector-icons/Feather";
import { MessageBubbleContent, ReactionChips } from "./MessageBubble";
import type { Message } from "@/types/message";

const SCREEN = Dimensions.get("window");

type Position = {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
};

type MessageActionSheetProps = {
  visible: boolean;
  isMine: boolean;
  message: Message | null;
  messageId: number;
  position: Position | null;
  textColor: string;
  bubbleColor: string;
  isGroup: boolean;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  onReact?: (emoji: string) => void;
  onReply: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onInfo?: () => void;
  onClose: () => void;
  onDismissStart?: () => void;
  /** False when the current user can't pin (non-admin in a group). */
  canPin?: boolean;
};

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;
const REACTION_SIZE = 44;
const REACTION_GAP = 4;
const REACTION_BAR_PADDING_H = 12;
const REACTION_BAR_HEIGHT = REACTION_SIZE + REACTION_BAR_PADDING_H * 2;
const REACTION_BAR_WIDTH =
  REACTIONS.length * REACTION_SIZE +
  (REACTIONS.length - 1) * REACTION_GAP +
  REACTION_BAR_PADDING_H * 2;
const MENU_WIDTH = 200;
const MENU_ROW_HEIGHT = 44;
const MENU_PADDING_V = 6;
const FLOAT_GAP = 10;
const SCREEN_PAD = 12;

const EXIT_DURATION = 120;
const EXIT_EASING = REasing.out(REasing.cubic);
const ENTER_DURATION = 120;
const ENTER_EASING = REasing.out(REasing.quad);

type Layout = {
  groupTop: number;
  groupHeight: number;
  menuHeight: number;
  copyHeight: number;
  reactionLeft: number;
  menuLeft: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

function menuRowsFor(isGroup: boolean, isMine: boolean): string[] {
  if (isGroup) {
    return isMine
      ? ["reply", "edit", "copy", "forward", "pin", "info", "delete"]
      : ["reply", "copy", "forward", "pin", "info"];
  }
  return isMine
    ? ["reply", "edit", "copy", "forward", "pin", "delete"]
    : ["reply", "copy", "forward", "pin"];
}

function computeLayout(p: Position, isMine: boolean, isGroup: boolean): Layout {
  const menuHeight =
    menuRowsFor(isGroup, isMine).length * MENU_ROW_HEIGHT +
    MENU_PADDING_V * 2;

  // Cap how tall the floating bubble copy may be so the menu stays visible
  // even for very long messages: what's left of the screen after the reaction
  // bar, menu, gaps and padding are reserved.
  const availableCopy = Math.max(
    0,
    SCREEN.height -
      2 * SCREEN_PAD -
      REACTION_BAR_HEIGHT -
      FLOAT_GAP * 2 -
      menuHeight,
  );
  const copyHeight = Math.min(p.height, availableCopy);

  // Real measured bubble height — no phantom min-height, so the spacing
  // between the reaction bar / bubble / menu is always consistent.
  const groupHeight =
    REACTION_BAR_HEIGHT + FLOAT_GAP + copyHeight + FLOAT_GAP + menuHeight;

  // Anchor so the floating bubble lands exactly where the original message
  // sits; only shift the whole group when it wouldn't fit on screen.
  const unclampedGroupTop = p.pageY - REACTION_BAR_HEIGHT - FLOAT_GAP;
  const maxGroupTop = Math.max(
    SCREEN_PAD,
    SCREEN.height - groupHeight - SCREEN_PAD,
  );
  const groupTop = clamp(
    unclampedGroupTop,
    SCREEN_PAD,
    maxGroupTop,
  );

  // Anchor the reaction bar to the bubble's OUTER edge — for incoming messages
  // (left side) hug the bubble's left edge, for mine (right side) hug the
  // right edge. Centering under the bubble would push the emojis far away
  // from a short bubble that sits at a screen edge.
  const reactionLeft = clamp(
    isMine
      ? p.pageX + p.width - REACTION_BAR_WIDTH
      : p.pageX,
    SCREEN_PAD,
    SCREEN.width - REACTION_BAR_WIDTH - SCREEN_PAD,
  );

  const menuLeft = clamp(
    p.pageX + p.width / 2 > SCREEN.width / 2
      ? p.pageX + p.width - MENU_WIDTH
      : p.pageX,
    SCREEN_PAD,
    SCREEN.width - MENU_WIDTH - SCREEN_PAD,
  );

  return {
    groupTop,
    groupHeight,
    menuHeight,
    copyHeight,
    reactionLeft,
    menuLeft,
  };
}

const reactionBarStyle = {
  width: REACTION_BAR_WIDTH,
  height: REACTION_BAR_HEIGHT,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  paddingHorizontal: REACTION_BAR_PADDING_H,
  gap: REACTION_GAP,
  backgroundColor: "rgba(40,40,40,0.55)",
  borderRadius: 28,
  overflow: "hidden" as const,
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 12,
};

const menuStyle = {
  width: MENU_WIDTH,
  backgroundColor: "rgba(40,40,40,0.6)",
  borderRadius: 16,
  overflow: "hidden" as const,
  shadowColor: "#000",
  shadowOpacity: 0.4,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  elevation: 14,
  paddingVertical: MENU_PADDING_V,
};

export function MessageActionSheet({
  visible,
  isMine,
  message,
  isGroup,
  position,
  textColor,
  bubbleColor,
  onEdit,
  onDelete,
  onReact,
  onReply,
  onForward,
  onPin,
  onInfo,
  onClose,
  onDismissStart,
  canPin = true,
}: MessageActionSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const isDismissingRef = useRef(false);

  const overlayOpacity = useSharedValue(0);
  const groupTranslateY = useSharedValue(0);
  const reactionOpacity = useSharedValue(0);
  const reactionTranslateY = useSharedValue(8);
  const menuOpacity = useSharedValue(0);
  const menuTranslateY = useSharedValue(8);
  const copyScrollY = useSharedValue(0);
  const copyScrollContentH = useSharedValue(0);
  const copyScrollRef = useRef<ScrollView>(null);

  const reactScale0 = useSharedValue(1);
  const reactScale1 = useSharedValue(1);
  const reactScale2 = useSharedValue(1);
  const reactScale3 = useSharedValue(1);
  const reactScale4 = useSharedValue(1);
  const reactScale5 = useSharedValue(1);
  const reactScales = [
    reactScale0,
    reactScale1,
    reactScale2,
    reactScale3,
    reactScale4,
    reactScale5,
  ];

  const layout = useMemo(
    () => (position ? computeLayout(position, isMine, isGroup) : null),
    [position, isMine, isGroup],
  );

  // Where the group sits so the floating bubble overlaps the original spot.
  const pinnedGroupTop = position
    ? position.pageY - REACTION_BAR_HEIGHT - FLOAT_GAP
    : 0;

  const truncated =
    layout !== null && position !== null && layout.copyHeight < position.height;

  const finishClose = useCallback(() => {
    isDismissingRef.current = false;
    setMounted(false);
    onClose();
  }, [onClose]);

  const dismiss = useCallback(() => {
    if (isDismissingRef.current || !position) return;
    isDismissingRef.current = true;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismissStart?.();

    groupTranslateY.value = withTiming(pinnedGroupTop, {
      duration: EXIT_DURATION,
      easing: EXIT_EASING,
    });

    reactionOpacity.value = withTiming(0, {
      duration: 90,
      easing: EXIT_EASING,
    });
    reactionTranslateY.value = withTiming(8, { duration: 90 });
    menuOpacity.value = withTiming(0, { duration: 90, easing: EXIT_EASING });
    menuTranslateY.value = withTiming(8, { duration: 90 });

    overlayOpacity.value = withTiming(
      0,
      { duration: EXIT_DURATION, easing: EXIT_EASING },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [
    position,
    pinnedGroupTop,
    finishClose,
    onDismissStart,
    overlayOpacity,
    groupTranslateY,
    reactionOpacity,
    reactionTranslateY,
    menuOpacity,
    menuTranslateY,
  ]);

  useEffect(() => {
    if (!visible || !position || !layout) return;
    setMounted(true);
    isDismissingRef.current = false;

    groupTranslateY.value = pinnedGroupTop;
    overlayOpacity.value = 0;
    reactionOpacity.value = 0;
    reactionTranslateY.value = 8;
    menuOpacity.value = 0;
    menuTranslateY.value = 8;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    overlayOpacity.value = withTiming(1, {
      duration: 150,
      easing: ENTER_EASING,
    });
    groupTranslateY.value = withTiming(layout.groupTop, {
      duration: ENTER_DURATION,
      easing: ENTER_EASING,
    });
    reactionOpacity.value = withTiming(1, {
      duration: ENTER_DURATION,
      easing: ENTER_EASING,
    });
    reactionTranslateY.value = withTiming(0, {
      duration: ENTER_DURATION,
      easing: ENTER_EASING,
    });
    menuOpacity.value = withDelay(
      12,
      withTiming(1, { duration: ENTER_DURATION, easing: ENTER_EASING }),
    );
    menuTranslateY.value = withDelay(
      12,
      withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASING }),
    );
  }, [
    visible,
    position,
    layout,
    pinnedGroupTop,
    overlayOpacity,
    groupTranslateY,
    reactionOpacity,
    reactionTranslateY,
    menuOpacity,
    menuTranslateY,
  ]);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const groupAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: groupTranslateY.value }],
  }));

  const moreHintStyle = useAnimatedStyle(() => {
    const viewportH = layout?.copyHeight ?? 0;
    const maxOffset = Math.max(copyScrollContentH.value - viewportH, 0);
    const nearEnd =
      copyScrollContentH.value <= 0 || copyScrollY.value >= maxOffset - 20;
    return { opacity: nearEnd ? 0 : 1 };
  });

  const reactionAnimStyle = useAnimatedStyle(() => ({
    opacity: reactionOpacity.value,
    transform: [{ translateY: reactionTranslateY.value }],
  }));

  const menuAnimStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ translateY: menuTranslateY.value }],
  }));

  if (!mounted || !position || !layout) return null;

  const handleReaction = async (emoji: string, index: number) => {
    reactScales[index].value = withSequence(
      withTiming(1.3, { duration: 90 }),
      withTiming(1, { duration: 130 }),
    );
    Haptics.selectionAsync();
    onReact?.(emoji);

    dismiss();
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message?.text ?? "");
    dismiss();
  };

  const handleDelete = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await onDelete();
    } catch (error) {
      console.warn("Delete action failed:", error);
      Alert.alert("Delete failed", "The message could not be deleted.");
    } finally {
      dismiss();
    }
  };

  const renderBlur = (bStyle: any, intensity = 40) => (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, bStyle]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
        experimentalBlurMethod="dimezisBlurView"
      />
    </Animated.View>
  );

  const menuItems = [
    {
      key: "reply",
      icon: "corner-up-left" as const,
      label: "Reply",
      onPress: () => {
        onReply();
        dismiss();
      },
    },
    ...(isMine
      ? [
          {
            key: "edit",
            icon: "edit-2" as const,
            label: "Edit",
            onPress: () => {
              onEdit();
              dismiss();
            },
          },
        ]
      : []),
    {
      key: "copy",
      icon: "copy" as const,
      label: "Copy",
      onPress: handleCopy,
    },
    {
      key: "forward",
      icon: "corner-up-right" as const,
      label: "Forward",
      onPress: () => {
        onForward?.();
        dismiss();
      },
    },
    {
      key: "pin",
      icon: "map-pin" as const,
      label: "Pin",
      disabled: !canPin,
      onPress: () => {
        onPin?.();
        dismiss();
      },
    },
    ...(isGroup
      ? [
          {
            key: "info",
            icon: "info" as const,
            label: "Info",
            onPress: () => {
              onInfo?.();
              dismiss();
            },
          },
        ]
      : []),
    ...(isMine
      ? [
          {
            key: "delete",
            icon: "trash-2" as const,
            label: "Delete",
            color: "#EF4444",
            onPress: handleDelete,
          },
        ]
      : []),
  ];

  const hasReactions = (message?.reactions?.length ?? 0) > 0;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={{ flex: 1 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />

        {renderBlur(overlayAnimStyle, 38)}

        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
        >
          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                width: SCREEN.width,
              },
              groupAnimStyle,
            ]}
          >
            {/* Reaction bar — anchored horizontally, in vertical flow so the
                gap to the bubble is always exact. */}
            <View
              pointerEvents="box-none"
              style={{
                height: REACTION_BAR_HEIGHT,
                paddingLeft: layout.reactionLeft,
                marginBottom: FLOAT_GAP,
                zIndex: 20,
              }}
            >
              <Animated.View style={[reactionBarStyle, reactionAnimStyle]}>
                {REACTIONS.map((emoji, i) => (
                  <ReactionEmoji
                    key={i}
                    emoji={emoji}
                    scaleValue={reactScales[i]}
                    onPress={() => handleReaction(emoji, i)}
                  />
                ))}
              </Animated.View>
            </View>

            {/* Faithful floating copy of the original message — pinned to the
                exact measured position, so its padding and margins match the
                real bubble exactly. */}
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
                    ...(truncated ? { height: layout.copyHeight } : {}),
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
                    <MessageBubbleContent
                      text={message?.text ?? ""}
                      isMine={isMine}
                      textColor={textColor}
                      bubbleColor={bubbleColor}
                      editedAt={message?.editedAt ?? undefined}
                      sentAt={message?.sentAt}
                      isPending={(message?.id ?? 0) < 0}
                      isGroup={isGroup}
                      repliedTo={message?.repliedTo}
                      replyToId={message?.replyToId}
                      forwardedFromMsgId={message?.forwardedFromMsgId}
                    />
                  </ScrollView>
                ) : (
                  <MessageBubbleContent
                    text={message?.text ?? ""}
                    isMine={isMine}
                    textColor={textColor}
                    bubbleColor={bubbleColor}
                    editedAt={message?.editedAt ?? undefined}
                    sentAt={message?.sentAt}
                    isPending={(message?.id ?? 0) < 0}
                    isGroup={isGroup}
                    repliedTo={message?.repliedTo}
                    replyToId={message?.replyToId}
                    forwardedFromMsgId={message?.forwardedFromMsgId}
                  />
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
                      onPress={() =>
                        copyScrollRef.current?.scrollToEnd({ animated: true })
                      }
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

            {/* Action menu — anchored horizontally, in vertical flow below the
                bubble with the exact same gap as the reaction bar above. */}
            <View
              pointerEvents="box-none"
              style={{
                height: layout.menuHeight,
                paddingLeft: layout.menuLeft,
                zIndex: 20,
              }}
            >
              <Animated.View style={[menuStyle, menuAnimStyle]}>
                <View style={{ zIndex: 30 }}>
                  {menuItems.map((item) => (
                    <MenuItem
                      key={item.key}
                      icon={item.icon}
                      label={item.label}
                      color={item.color}
                      disabled={item.disabled}
                      onPress={item.onPress}
                    />
                  ))}
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ReactionEmoji({
  emoji,
  scaleValue,
  onPress,
}: {
  emoji: string;
  scaleValue: SharedValue<number>;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: REACTION_SIZE,
        height: REACTION_SIZE,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: REACTION_SIZE / 2,
        zIndex: 30,
      }}
    >
      <Animated.Text style={[{ fontSize: 26 }, animatedStyle]}>
        {emoji}
      </Animated.Text>
    </Pressable>
  );
}

function MenuItem({
  icon,
  label,
  color = "#fff",
  disabled,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  };

  const itemColor = disabled ? "rgba(255,255,255,0.35)" : color;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            height: MENU_ROW_HEIGHT,
          },
          animatedStyle,
        ]}
      >
        <Feather name={icon} size={17} color={itemColor} />
        <Text style={{ color: itemColor, fontSize: 15 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}
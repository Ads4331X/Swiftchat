import {
  Alert,
  Dimensions,
  Pressable,
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
import { MessageBubbleContent } from "./MessageBubble";

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
  message: string;
  messageId: number;
  position: Position | null;
  textColor: string;
  bubbleColor: string;
  onEdit: () => void;
  onDelete: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onClose: () => void;
  /** Fired the instant the exit animation begins (before it finishes), so the
   * parent screen can kick off any synced "background recede" animation. */
  onDismissStart?: () => void;
};

const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;
const REACTION_SIZE = 44;
const REACTION_GAP = 4;
const REACTION_BAR_PADDING_H = 12;
const REACTION_BAR_HEIGHT = REACTION_SIZE + REACTION_BAR_PADDING_H * 2;
const MENU_WIDTH = 200;
const MENU_ROW_HEIGHT = 44;
const MENU_PADDING_V = 6;
// Gap between the floating bubble and the reaction bar / menu. Padded out a
// bit extra to comfortably clear the bubble's ~4% pop-scale so nothing ever
// overlaps the message text.
const FLOAT_GAP = 14;
const SCREEN_PAD = 12;

// Tuned to feel close to Instagram's message long-press: quick, slightly
// underdamped springs for the bubble/menu, calmer timing for the backdrop.
const SPRING_MSG = { damping: 24, stiffness: 320, mass: 0.9 };
const SPRING_MENU = { damping: 20, stiffness: 280, mass: 0.8 };
const SPRING_REACT = { damping: 14, stiffness: 300, mass: 0.7 };
const EXIT_DURATION = 180;
const EXIT_EASING = REasing.out(REasing.cubic);

type Layout = {
  rowTop: number;
  reactionTop: number;
  reactionLeft: number;
  menuTop: number;
  menuLeft: number;
};

// Pure layout math, lifted out of the component so it isn't re-declared (or
// accidentally called with stale hook state) on every render.
function computeLayout(p: Position, isMine: boolean): Layout {
  const menuRows = (
    isMine
      ? ["reply", "edit", "copy", "pin", "delete", "more"]
      : ["reply", "copy", "forward", "more"]
  ).length;

  const menuHeight = menuRows * MENU_ROW_HEIGHT + MENU_PADDING_V * 2;
  const reactionBarWidth =
    REACTIONS.length * REACTION_SIZE +
    (REACTIONS.length - 1) * REACTION_GAP +
    REACTION_BAR_PADDING_H * 2;

  // Treat reactions + message + menu as one group. This prevents the
  // middle-of-screen collision caused by positioning each piece separately.
  // The whole group moves up for low messages and down for high messages,
  // matching the Instagram-style long-press behaviour.
  const effectiveHeight = p.height * 1.08;
  const groupHeight =
    REACTION_BAR_HEIGHT + FLOAT_GAP + effectiveHeight + FLOAT_GAP + menuHeight;

  const originalGroupTop = p.pageY - REACTION_BAR_HEIGHT - FLOAT_GAP;
  const maxGroupTop = Math.max(
    SCREEN_PAD,
    SCREEN.height - groupHeight - SCREEN_PAD,
  );
  const groupTop = Math.max(
    SCREEN_PAD,
    Math.min(originalGroupTop, maxGroupTop),
  );

  const reactionTop = groupTop;
  const rowTop = reactionTop + REACTION_BAR_HEIGHT + FLOAT_GAP;
  const menuTop = rowTop + effectiveHeight + FLOAT_GAP;

  let reactionLeft = p.pageX + p.width / 2 - reactionBarWidth / 2;
  reactionLeft = Math.max(
    SCREEN_PAD,
    Math.min(reactionLeft, SCREEN.width - reactionBarWidth - SCREEN_PAD),
  );

  let menuLeft =
    p.pageX + p.width / 2 > SCREEN.width / 2
      ? p.pageX + p.width - MENU_WIDTH
      : p.pageX;

  menuLeft = Math.max(
    SCREEN_PAD,
    Math.min(menuLeft, SCREEN.width - MENU_WIDTH - SCREEN_PAD),
  );

  return { rowTop, reactionTop, reactionLeft, menuTop, menuLeft };
}

export function MessageActionSheet({
  visible,
  isMine,
  message,
  messageId,
  position,
  textColor,
  bubbleColor,
  onEdit,
  onDelete,
  onReply,
  onForward,
  onPin,
  onClose,
  onDismissStart,
}: MessageActionSheetProps) {
  // Keeps the Modal mounted through the exit animation; only unmounts once
  // the animation has actually finished, avoiding the "flicker" of the
  // native Modal disappearing instantly while things are still animating.
  const [mounted, setMounted] = useState(visible);
  const isDismissingRef = useRef(false);

  const overlayOpacity = useSharedValue(0);
  const msgScale = useSharedValue(1);
  const rowTranslateY = useSharedValue(0);
  const reactionOpacity = useSharedValue(0);
  const reactionTranslateY = useSharedValue(8);
  const menuOpacity = useSharedValue(0);
  const menuTranslateY = useSharedValue(8);

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
    () => (position ? computeLayout(position, isMine) : null),
    [position, isMine],
  );

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

    // Bubble eases back down to exactly where it was picked up from, and
    // shrinks back to its resting scale — the reverse of the entrance.
    msgScale.value = withSpring(1, SPRING_MSG);
    rowTranslateY.value = withSpring(position.pageY, SPRING_MSG);

    reactionOpacity.value = withTiming(0, {
      duration: 120,
      easing: EXIT_EASING,
    });
    reactionTranslateY.value = withTiming(8, { duration: 120 });
    menuOpacity.value = withTiming(0, { duration: 120, easing: EXIT_EASING });
    menuTranslateY.value = withTiming(8, { duration: 120 });

    overlayOpacity.value = withTiming(
      0,
      { duration: EXIT_DURATION, easing: EXIT_EASING },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [
    position,
    finishClose,
    onDismissStart,
    overlayOpacity,
    msgScale,
    rowTranslateY,
    reactionOpacity,
    reactionTranslateY,
    menuOpacity,
    menuTranslateY,
  ]);

  useEffect(() => {
    if (!visible || !position || !layout) return;
    setMounted(true);
    isDismissingRef.current = false;

    // Start at the original message position, then animate the selected
    // message to the calculated Instagram-style resting position.
    rowTranslateY.value = position.pageY;
    msgScale.value = 1;
    overlayOpacity.value = 0;
    reactionOpacity.value = 0;
    reactionTranslateY.value = 8;
    menuOpacity.value = 0;
    menuTranslateY.value = 8;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    overlayOpacity.value = withSpring(1, { damping: 30, stiffness: 200 });
    rowTranslateY.value = withSpring(layout.rowTop, SPRING_MSG);
    msgScale.value = withSpring(1.04, SPRING_MSG);
    reactionOpacity.value = withDelay(
      50,
      withSpring(1, { damping: 20, stiffness: 200 }),
    );
    reactionTranslateY.value = withDelay(50, withSpring(0, SPRING_REACT));
    menuOpacity.value = withDelay(
      90,
      withSpring(1, { damping: 20, stiffness: 200 }),
    );
    menuTranslateY.value = withDelay(90, withSpring(0, SPRING_MENU));
  }, [
    visible,
    position,
    layout,
    overlayOpacity,
    msgScale,
    rowTranslateY,
    reactionOpacity,
    reactionTranslateY,
    menuOpacity,
    menuTranslateY,
  ]);

  const overlayAnimStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  // Only vertical movement here — the row spans the full screen width and
  // mirrors the list's own row markup, so horizontal alignment matches
  // exactly without needing any translateX math.
  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: rowTranslateY.value }],
  }));

  // Scale is applied to the bubble itself (not the full-width row), so it
  // pops from its own center instead of the row's center.
  const bubbleScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: msgScale.value }],
  }));

  const reactionAnimStyle = useAnimatedStyle(() => ({
    opacity: reactionOpacity.value,
    transform: [{ translateY: reactionTranslateY.value }],
  }));

  const menuAnimStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ translateY: menuTranslateY.value }],
  }));

  if (!mounted || !position || !layout) return null;

  const handleReaction = (index: number) => {
    reactScales[index].value = withSequence(
      withSpring(1.35, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 14, stiffness: 300 }),
    );
    Haptics.selectionAsync();
    dismiss();
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message);
    dismiss();
  };

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert("Delete message?", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          onDelete();
          dismiss();
        },
      },
    ]);
  };

  // Purely decorative blur/dim layers must never intercept touches — only
  // the dedicated backdrop Pressable should. Missing this was why tapping
  // outside the sheet couldn't dismiss it.
  const renderBlur = (bStyle: any, intensity = 40) => (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, bStyle]}
    >
      <BlurView
        intensity={intensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );

  const reactionBarWidth =
    REACTIONS.length * REACTION_SIZE +
    (REACTIONS.length - 1) * REACTION_GAP +
    REACTION_BAR_PADDING_H * 2;

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

        {renderBlur(overlayAnimStyle, 50)}

        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
        >
          {/* Row: identical horizontal layout to the real list row, so the
              floating bubble lines up pixel-for-pixel with no drift. */}
          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: "absolute",
                left: 0,
                width: SCREEN.width,
              },
              rowAnimStyle,
            ]}
          >
            <View
              className={`flex-row px-3 ${isMine ? "justify-end" : "justify-start"}`}
            >
              <Animated.View
                style={[
                  {
                    shadowColor: "#000",
                    shadowOpacity: 0.3,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 16,
                  },
                  bubbleScaleStyle,
                ]}
              >
                <MessageBubbleContent
                  text={message}
                  isMine={isMine}
                  textColor={textColor}
                  bubbleColor={bubbleColor}
                />
              </Animated.View>
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: "absolute",
                top: layout.reactionTop,
                left: layout.reactionLeft,
                width: reactionBarWidth,
                height: REACTION_BAR_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: REACTION_BAR_PADDING_H,
                gap: REACTION_GAP,
                backgroundColor: "rgba(40,40,40,0.55)",
                borderRadius: 28,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.35,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 12,
                zIndex: 20,
              },
              reactionAnimStyle,
            ]}
          >
            {renderBlur({}, 30)}
            {REACTIONS.map((emoji, i) => (
              <ReactionEmoji
                key={i}
                emoji={emoji}
                scaleValue={reactScales[i]}
                onPress={() => handleReaction(i)}
              />
            ))}
          </Animated.View>

          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: "absolute",
                top: layout.menuTop,
                left: layout.menuLeft,
                width: MENU_WIDTH,
                backgroundColor: "rgba(40,40,40,0.6)",
                borderRadius: 16,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.4,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
                elevation: 14,
                zIndex: 20,
                paddingVertical: MENU_PADDING_V,
              },
              menuAnimStyle,
            ]}
          >
            {renderBlur({}, 35)}

            <View style={{ zIndex: 30 }}>
              <MenuItem
                icon="corner-up-left"
                label="Reply"
                onPress={() => {
                  onReply?.();
                  dismiss();
                }}
              />
              {isMine && (
                <MenuItem
                  icon="edit-2"
                  label="Edit"
                  onPress={() => {
                    onEdit();
                    dismiss();
                  }}
                />
              )}
              <MenuItem icon="copy" label="Copy" onPress={handleCopy} />
              {!isMine && (
                <MenuItem
                  icon="corner-up-right"
                  label="Forward"
                  onPress={() => {
                    onForward?.();
                    dismiss();
                  }}
                />
              )}
              <MenuItem
                icon="map-pin"
                label="Pin"
                onPress={() => {
                  onPin?.();
                  dismiss();
                }}
              />
              {isMine && (
                <MenuItem
                  icon="trash-2"
                  label="Delete"
                  color="#EF4444"
                  onPress={handleDelete}
                />
              )}
              <MenuItem icon="more-horizontal" label="More" onPress={dismiss} />
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
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color?: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 20, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  };

  return (
    <Pressable
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
        <Feather name={icon} size={17} color={color} />
        <Text style={{ color, fontSize: 15 }}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { type Position } from "@/features/chat/types";
import type { Message } from "@/types/message";
import {
  ENTER_DURATION,
  ENTER_EASING,
  EXIT_DURATION,
  EXIT_EASING,
  FLOAT_GAP,
  REACTION_BAR_HEIGHT,
  SCREEN,
  menuStyle,
  reactionBarStyle,
} from "@/features/chat/components/actions/constants";
import { computeLayout } from "@/features/chat/components/actions/layout";
import { ReactionBar } from "@/features/chat/components/actions/ReactionBar";
import { MenuItem } from "@/features/chat/components/actions/MenuItem";
import { FloatingMessagePreview } from "@/features/chat/components/actions/FloatingMessagePreview";

type MessageActionSheetProps = {
  visible: boolean;
  isMine: boolean;
  message: Message | null;
  messageId: number;
  position: Position | null;
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

export function MessageActionSheet({
  visible,
  isMine,
  message,
  isGroup,
  position,
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

  const reactionAnimStyle = useAnimatedStyle(() => ({
    opacity: reactionOpacity.value,
    transform: [{ translateY: reactionTranslateY.value }],
  }));

  const menuAnimStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ translateY: menuTranslateY.value }],
  }));

  if (!mounted || !position || !layout) return null;

  const handleReaction = (emoji: string, index: number) => {
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

  const menuItems: {
    key: string;
    icon: ComponentProps<typeof MenuItem>["icon"];
    label: string;
    color?: string;
    disabled?: boolean;
    onPress: () => void;
  }[] = [
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
                <ReactionBar scales={reactScales} onReact={handleReaction} />
              </Animated.View>
            </View>

            {/* Faithful floating copy of the original message. */}
            <FloatingMessagePreview
              message={message}
              isMine={isMine}
              isGroup={isGroup}
              position={position}
              hasReactions={hasReactions}
              truncated={truncated}
              copyHeight={layout.copyHeight}
            />

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

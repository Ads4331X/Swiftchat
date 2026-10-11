import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

/**
 * Full-screen image viewer. Opens with a springy "bounce" so the image pops
 * from the chat bubble to fill the screen. Tap anywhere to close.
 */
export function MediaViewer({
  visible,
  uri,
  onClose,
}: {
  visible: boolean;
  uri?: string | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.4);
    Animated.spring(scale, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [visible, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/95">
        {/* Tap-anywhere-to-close layer, behind the image. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {uri ? (
          <Animated.View
            pointerEvents="none"
            style={{ transform: [{ scale }] }}
          >
            <Image
              source={{ uri }}
              contentFit="contain"
              style={{ width, height }}
            />
          </Animated.View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close image viewer"
          hitSlop={10}
          onPress={onClose}
          className="absolute right-4 top-14 h-9 w-9 items-center justify-center rounded-full bg-black/60"
        >
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import Video from "react-native-video";
import { Feather } from "@expo/vector-icons";

// full-screen video player. mounts the player only while visible so playback
// stops as soon as the viewer closes.
export function VideoViewer({
  visible,
  uri,
  onClose,
}: {
  visible: boolean;
  uri?: string | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) setFailed(false);
  }, [visible, uri]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/95">
        {visible && uri && !failed ? (
          <Video
            source={{ uri }}
            style={{ width, height }}
            resizeMode="contain"
            controls
            onError={() => setFailed(true)}
          />
        ) : failed ? (
          <Text className="text-sm font-semibold text-white">
            Unable to play video
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close video viewer"
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

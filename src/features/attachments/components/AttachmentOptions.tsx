import { useTheme } from "@/shared/providers/theme-provider";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { launchFile, launchGallery } from "@/features/attachments/services/pickers";
import { router, useLocalSearchParams } from "expo-router";
import { useAttachmentCameraPermission } from "@/features/attachments/hooks/useAttachmentCameraPermission";
import { useSendAttachments } from "@/features/attachments/hooks/useSendAttachments";
import type { SendAttachment } from "@/features/chat/services/sendAttachment";

type AttachmentOptionsProps = {
  onClose: () => void;
};

export function AttachmentOptions({ onClose }: AttachmentOptionsProps) {
  const { hasPermission, canRequestPermission, requestPermission } =
    useAttachmentCameraPermission();
  const theme = useTheme();
  const colors = theme.colors;
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const { send } = useSendAttachments({ conversationId });

  const handleCameraPress = async () => {
    if (!hasPermission) {
      if (!canRequestPermission) {
        Alert.alert(
          "Permission needed",
          "Please enable camera access in Settings.",
        );
        return;
      }

      const granted = await requestPermission();

      if (!granted) {
        return;
      }
    }

    router.push({ pathname: "/camera" as any });
  };
const handleGalleryPress = async () => {
    const result = await launchGallery();
    const assets = result?.assets;
    if (!assets) return;

    // useSendAttachments compresses, encrypts and uploads them for us
    const attachments: SendAttachment[] = assets.map((asset) => ({
      uri: asset.uri,
      kind: asset.type === "image" ? "image" : "video",
      width: asset.width,
      height: asset.height,
      size: asset.fileSize,
      mimeType: asset.mimeType,
    }));

    if (attachments.length) send({ attachments, caption: "" });
  };
  const handleFilePress = async () => {
    await launchFile();
  };
  const options = [
    {
      label: "Camera",
      icon: "camera",
      onPress: async () => await handleCameraPress(),
      disabled: Platform.OS === "web",
    },
    {
      label: "Gallery",
      icon: "image",
      onPress: async () => await handleGalleryPress(),
      disabled: false,
    },
    {
      label: "Files",
      icon: "file",
      onPress: async () => await handleFilePress(),
      disabled: false,
    },
  ] as const;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {/* Tap anywhere outside the popup (message list, header, composer)
            to dismiss. Rendered before the popup so the popup wins the hit
            test. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={{ backgroundColor: colors.background, marginTop: "auto" }}
          className="self-start ml-3 mb-16 min-w-24 rounded-md"
        >
          {options.map((option, index) => (
            <Pressable
              key={option.label}
              onPress={() => {
                option.onPress();
                onClose();
              }}
              style={{
                borderBottomWidth: index < options.length - 1 ? 1 : 0,
                borderBottomColor: theme.dividerColor,
                opacity: option.disabled ? 0.5 : 1,
              }}
              className="flex-row items-center justify-between p-2"
              disabled={option.disabled}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "500",
                  }}
                >
                  {option.label}
                </Text>

                {option.disabled && (
                  <Text
                    style={{
                      color: theme.subtleText,
                      fontSize: 10,
                      marginTop: 2,
                    }}
                  >
                    Not available on web
                  </Text>
                )}
              </View>

              <Feather name={option.icon} color={colors.text} />
            </Pressable>
          ))}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

import { useTheme } from "@/constants/theme-provider";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { launchCamera, launchFile, launchGallery } from "@/lib/Attachments";
import { compressImage } from "@/lib/utils";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { useCameraPermissions } from "expo-camera";

type AttachmentOptionsProps = {
  onClose: () => void;
};

export function AttachmentOptions({ onClose }: AttachmentOptionsProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const theme = useTheme();
  const colors = theme.colors;

  const handleCameraPress = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();

      if (!result.granted) {
        return;
      }
    }

    router.push({ pathname: "/CameraScreen" });

    // const result = await launchCamera();
    // const asset = result?.assets?.[0];
    // if (!asset?.uri) return;

    // const compressResult = await compressImage({
    //   uri: asset.uri,
    //   width: asset.width,
    //   height: asset.height,
    //   size: new File(asset.uri).size,
    // });

    // router.push({
    //   pathname: "/AttachmentReview",
    //   params: {
    //     uri: asset.uri,
    //   },
    // });
  };
  const handleGalleryPress = async () => {
    const result = await launchGallery();
    console.log(result);
  };
  const handleFilePress = async () => {
    const result = await launchFile();
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

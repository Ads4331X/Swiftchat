import { useTheme } from "@/constants/theme-provider";
import { Feather } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Video from "react-native-video";

export default function AttachmentReview() {
  const { uri, type } = useLocalSearchParams<{
    uri: string;
    type?: string;
  }>();

  const [loading, setLoading] = useState<boolean>(false);

  const theme = useTheme();
  const colors = theme.colors;

  const isVideo = type === "video";

  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const handleGoBack = () => {
    new File(uri).delete(); // deletes the file if user clicks back
    router.back();
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          {/* Top bar */}
          <View
            style={{
              height: 60,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.pillInactiveBg,
              }}
              onPress={handleGoBack}
            >
              <Feather name="x" size={22} color={colors.text} />
            </Pressable>

            <Pressable
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.pillInactiveBg,
              }}
            >
              <Feather name="edit-2" size={18} color={colors.icon} />
            </Pressable>
          </View>

          {/* Preview */}
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            {isVideo ? (
              <View className="w-full h-full">
                <Video
                  source={{ uri }}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 16,
                  }}
                  resizeMode="contain"
                  controls
                  repeat
                  paused={!isPlaying}
                  playInBackground={false}
                  playWhenInactive={false}
                  enterPictureInPictureOnLeave
                  onPlaybackStateChanged={({ isPlaying: playing }) =>
                    setIsPlaying(playing)
                  }
                />
                <Pressable
                  className="absolute left-1/2 top-1/2 -ml-8 -mt-8 h-16 w-16 items-center justify-center rounded-full"
                  onPress={() => setIsPlaying((playing) => !playing)}
                />
              </View>
            ) : (
              <Image
                source={{ uri }}
                resizeMode="contain"
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 16,
                }}
              />
            )}
          </View>

          {/* Bottom composer */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 24,
                paddingHorizontal: 18,
                justifyContent: "center",
                backgroundColor: colors.pillInactiveBg,
              }}
            >
              <TextInput
                placeholder="Add a caption..."
                placeholderTextColor={colors.pillInactiveText}
                style={{
                  color: colors.text,
                  fontSize: 15,
                  paddingVertical: 0,
                }}
              />
            </View>

            <Pressable
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.tint,
              }}
            >
              <Feather name="send" size={20} color={colors.background} />
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

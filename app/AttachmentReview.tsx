import { useTheme } from "@/constants/theme-provider";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AttachmentReview() {
  const { uri, type } = useLocalSearchParams<{
    uri: string;
    type?: string;
  }>();

  const [loading, setLoading] = useState<boolean>(false);

  const theme = useTheme();
  const colors = theme.colors;

  const isVideo = type === "video";

  const handleGoBack = () => {
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
            <View
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: "#000",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Video UI only for now */}
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="play" size={28} color="#fff" />
              </View>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

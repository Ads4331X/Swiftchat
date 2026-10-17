import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";

type ReviewComposerProps = {
  caption: string;
  onCaptionChange: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  disabled: boolean;
};

export function ReviewComposer({
  caption,
  onCaptionChange,
  onSend,
  sending,
  disabled,
}: ReviewComposerProps) {
  const { colors } = useTheme();
  const isDisabled = sending || disabled;

  return (
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
          style={{ color: colors.text, fontSize: 15, paddingVertical: 0 }}
          value={caption}
          onChangeText={onCaptionChange}
        />
      </View>

      <Pressable
        disabled={isDisabled}
        onPress={onSend}
        accessibilityRole="button"
        accessibilityLabel="Send"
        style={{
          width: 50,
          height: 50,
          borderRadius: 25,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.tint,
          opacity: isDisabled ? 0.6 : 1,
        }}
      >
        {sending ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Feather name="send" size={20} color={colors.background} />
        )}
      </Pressable>
    </View>
  );
}

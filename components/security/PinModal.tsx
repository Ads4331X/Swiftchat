import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/constants/theme-provider";
import { BRAND_COLOR } from "@/constants/theme";

type PinModalProps = {
  visible: boolean;
  mode: "create" | "enter";
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string | null;
  loading?: boolean;
};

const PIN_LENGTH = 6;

const TITLES = {
  create: "Create a Recovery PIN",
  enter: "Enter Your Recovery PIN",
} as const;

const SUBTITLES = {
  create:
    "You'll need this to recover your messages if you log in on a new device.",
  enter: "Enter the PIN you created to restore your encrypted messages.",
} as const;

export default function PinModal({
  visible,
  mode,
  onSubmit,
  onCancel,
  error,
  loading,
}: PinModalProps) {
  const { colors, subtleText, inputBg } = useTheme();
  const [digits, setDigits] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setDigits("");
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const handleChange = (text: string) => {
    const sanitized = text.replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (sanitized.length > digits.length && Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    setDigits(sanitized);
  };

  const confirmCancel = () => {
    Alert.alert(
      "Skip Recovery?",
      "Without a PIN, your messages can't be recovered if you reinstall the app or switch devices. This can't be undone later.",
      [
        { text: "Go Back", style: "cancel" },
        { text: "Skip Anyway", style: "destructive", onPress: onCancel },
      ],
    );
  };

  const boxes = Array.from({ length: PIN_LENGTH }, (_, i) => (
    <View
      key={i}
      style={{
        width: "14%",
        aspectRatio: 44 / 56,
        maxWidth: 46,
        borderRadius: 12,
        backgroundColor: inputBg,
        borderWidth: 2,
        borderColor: digits[i] ? BRAND_COLOR : colors.text,
        alignItems: "center",
        justifyContent: "center",
        opacity: digits[i] ? 1 : 0.25,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
        {digits[i] ? "•" : ""}
      </Text>
    </View>
  ));

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={confirmCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        className="flex-1 bg-black/50"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
          className="px-4"
        >
          <View
            className="w-full max-w-sm rounded-3xl p-6 self-center my-auto"
            style={{
              backgroundColor: colors.background,
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
            }}
          >
            <Text
              style={{ color: colors.text }}
              className="text-xl font-bold text-center mb-2"
            >
              {TITLES[mode]}
            </Text>
            <Text
              style={{ color: subtleText }}
              className="text-sm text-center mb-6 leading-5"
            >
              {SUBTITLES[mode]}
            </Text>

            {error ? (
              <Text className="text-[#EF4444] text-sm text-center mb-4 font-medium px-2">
                {error}
              </Text>
            ) : null}

            <View className="relative flex-row justify-between items-center my-3 py-1">
              <View pointerEvents="none" className="flex-row justify-between w-full">
                {boxes}
              </View>
              <TextInput
                ref={inputRef}
                value={digits}
                onChangeText={handleChange}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={PIN_LENGTH}
                autoFocus
                caretHidden
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: 0.01,
                  fontSize: 1,
                  color: "transparent",
                }}
              />
            </View>

            <Pressable
              onPress={() => onSubmit(digits)}
              disabled={digits.length !== PIN_LENGTH || loading}
              className="rounded-2xl py-4 items-center mt-5 active:opacity-90"
              style={{
                backgroundColor: BRAND_COLOR,
                opacity: digits.length === PIN_LENGTH && !loading ? 1 : 0.4,
              }}
            >
              <Text className="text-white text-lg font-semibold">
                {loading ? "Verifying..." : mode === "create" ? "Save PIN" : "Unlock"}
              </Text>
            </Pressable>

            <Pressable
              onPress={confirmCancel}
              hitSlop={{ top: 12, bottom: 12 }}
              className="py-3 items-center mt-1"
            >
              <Text className="text-[#EF4444] font-medium">Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

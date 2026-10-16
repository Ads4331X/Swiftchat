import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { RefObject } from "react";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useTheme } from "@/shared/providers/theme-provider";

type AppTextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  icon?: keyof typeof AntDesign.glyphMap;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences";
  error?: string;
  inputRef?: RefObject<TextInput | null>;
};

export default function AppTextField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  icon,
  secureTextEntry,
  keyboardType = "default",
  autoCapitalize = "none",
  error,
  inputRef,
}: AppTextFieldProps) {
  const { colors, subtleText, inputBorderColor, inputBg, placeholderColor } =
    useTheme();
  const [showPassword, setShowPassword] = useState(false);

  const fieldStyle = {
    borderWidth: 1,
    borderColor: error ? "#EF4444" : inputBorderColor,
    backgroundColor: inputBg,
    borderRadius: 12,
    paddingHorizontal: icon ? 50 : 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  };

  return (
    <View className="mb-4">
      <Text
        style={{ color: colors.text }}
        className="text-sm font-medium mb-1.5"
      >
        {label}
      </Text>

      <View className="relative justify-center">
        {icon ? (
          <View className="absolute left-4 z-10">
            <AntDesign name={icon} size={20} color={subtleText} />
          </View>
        ) : null}

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          style={[fieldStyle, secureTextEntry ? { paddingRight: 44 } : null]}
        />

        {secureTextEntry ? (
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            hitSlop={10}
            className="absolute right-4"
          >
            <AntDesign
              name={showPassword ? "eye-invisible" : "eye"}
              size={20}
              color={subtleText}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="text-red-500 text-sm mt-1">{error}</Text> : null}
    </View>
  );
}

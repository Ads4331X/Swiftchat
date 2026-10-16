import { Text, TextInput, Pressable, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { forwardRef } from "react";
import { useTheme } from "@/shared/providers/theme-provider";

type UsernameSearchInputProps = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur: () => void;
  onSubmitEditing: () => void;
  onCancel: () => void;
};

const UsernameSearchInput = forwardRef<TextInput, UsernameSearchInputProps>(
  function UsernameSearchInput(
    { value, onChangeText, onBlur, onSubmitEditing, onCancel },
    ref,
  ) {
    const theme = useTheme();
    const colors = theme.colors;
    const { subtleText, inputBorderColor, inputBg, placeholderColor } = theme;

    const fieldStyle = {
      borderWidth: 1,
      borderColor: inputBorderColor,
      backgroundColor: inputBg,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    };

    return (
      <View className="flex-row items-center gap-2">
        <View
          style={{
            flex: 1,
            position: "relative",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 16,
              zIndex: 1,
            }}
          >
            <Feather name="search" size={20} color={subtleText} />
          </View>

          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChangeText}
            onBlur={onBlur}
            keyboardType="web-search"
            returnKeyType="search"
            enterKeyHint="search"
            onSubmitEditing={onSubmitEditing}
            placeholder="Search the username"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              fieldStyle,
              {
                height: 52,
                paddingLeft: 46,
                borderRadius: 14,
              },
            ]}
          />
        </View>

        <Pressable
          onPress={onCancel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          className="px-2 py-1 rounded-md active:opacity-60"
        >
          <Text style={{ color: colors.text }} className="font-medium">
            Cancel
          </Text>
        </Pressable>
      </View>
    );
  },
);

export default UsernameSearchInput;

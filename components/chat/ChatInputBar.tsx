import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { type EdgeInsets } from "react-native-safe-area-context";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";

const ACCESSORY_ID = "chat_input_accessory";

type ChatInputBarProps = {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  keyboardVisible: boolean;
  insets: EdgeInsets;
  inputBg: string;
  inputBorderColor: string;
  placeholderColor: string;
  textColor: string;
  subtleText: string;
  dividerColor: string;
  backgroundColor: string;
  onFocus?: () => void;
};

export default function ChatInputBar({
  draft,
  onDraftChange,
  onSend,
  sending,
  keyboardVisible,
  insets,
  inputBg,
  inputBorderColor,
  placeholderColor,
  textColor,
  subtleText,
  dividerColor,
  backgroundColor,
  onFocus,
}: ChatInputBarProps) {
  return (
    <View
      className="w-full flex-row items-end gap-3 px-3 py-2"
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
        backgroundColor,
        paddingBottom: keyboardVisible
          ? 8
          : (insets?.bottom ?? 0) > 0
            ? insets.bottom
            : 8,
      }}
    >
      <Pressable className="p-1 mb-2">
        <Feather name="camera" size={22} color={subtleText} />
      </Pressable>

      <TextInput
        {...(Platform.OS === "ios"
          ? { inputAccessoryViewID: ACCESSORY_ID }
          : {})}
        value={draft}
        onChangeText={onDraftChange}
        onFocus={onFocus}
        placeholder="Message"
        placeholderTextColor={placeholderColor}
        multiline
        className="flex-1 rounded-2xl px-4"
        style={{
          backgroundColor: inputBg,
          color: textColor,
          borderWidth: 1,
          borderColor: inputBorderColor,
          minHeight: 40,
          maxHeight: 120,
          paddingVertical: 8,
          textAlignVertical: "top",
        }}
      />

      <Pressable className="p-1 mb-2">
        <Feather name="mic" size={22} color={subtleText} />
      </Pressable>

      <Pressable
        onPress={onSend}
        disabled={sending || !draft.trim()}
        className="w-10 h-10 mb-2 rounded-full items-center justify-center"
        style={{
          backgroundColor: !draft.trim() || sending ? textColor : BRAND_COLOR,
        }}
      >
        {sending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Feather name="send" size={18} color="#fff" />
        )}
      </Pressable>
    </View>
  );
}

export { ACCESSORY_ID };

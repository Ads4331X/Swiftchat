import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useEffect, useState } from "react";

import { type EdgeInsets } from "react-native-safe-area-context";

import Feather from "@expo/vector-icons/Feather";

import { BRAND_COLOR } from "@/constants/theme";
import { AttachmentOptions } from "./AttachmentOptions";

type ChatInputBarProps = {
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  insets: EdgeInsets;
  inputBg: string;
  inputBorderColor: string;
  placeholderColor: string;
  textColor: string;
  subtleText: string;
  dividerColor: string;
  backgroundColor: string;
  isTyping?: boolean;
  onFocus?: () => void;
  showAttachmentOptions: boolean;
  setShowAttachmentOptions: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ChatInputBar({
  draft,
  onDraftChange,
  onSend,
  sending,
  insets,
  inputBg,
  inputBorderColor,
  placeholderColor,
  textColor,
  subtleText,
  dividerColor,
  backgroundColor,
  isTyping,
  showAttachmentOptions,
  setShowAttachmentOptions,
  onFocus,
}: ChatInputBarProps) {
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const subShow = Keyboard.addListener(showEvt, () => setKeyboardUp(true));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return (
    <View
      className="w-full flex-row items-end gap-3 px-3 py-2"
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: dividerColor,
        backgroundColor,
        paddingBottom: keyboardUp ? 8 : (insets?.bottom ?? 0) || 8,
      }}
    >
      {showAttachmentOptions && (
        <AttachmentOptions onClose={() => setShowAttachmentOptions(false)} />
      )}
      {/* plus more options */}
      <Pressable
        className="p-1 mb-2"
        onPress={() => {
          setShowAttachmentOptions(true);
        }}
      >
        <Feather name="plus" size={22} color={subtleText} />
      </Pressable>

      {/* Text input */}
      <TextInput
        value={draft}
        onChangeText={onDraftChange}
        onFocus={onFocus}
        onTouchStart={() => setShowAttachmentOptions(false)}
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

      {/* Microphone */}
      <Pressable
        className="p-1 mb-2"
        onPress={() => {
          setShowAttachmentOptions(false);
        }}
      >
        <Feather name="mic" size={22} color={subtleText} />
      </Pressable>

      {/* Send */}
      <Pressable
        onPress={() => {
          setShowAttachmentOptions(false);
          onSend();
        }}
        disabled={sending || !draft.trim()}
        className="w-10 h-10 mb-2 rounded-full items-center justify-center"
        style={{
          backgroundColor: !draft.trim() || sending ? subtleText : BRAND_COLOR,
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

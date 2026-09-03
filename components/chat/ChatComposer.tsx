import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { type EdgeInsets } from "react-native-safe-area-context";
import ChatInputBar from "./ChatInputBar";

type ChatComposerProps = {
  draft: string;
  editing: boolean;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onCancelEdit: () => void;
  sending: boolean;
  insets: EdgeInsets;
  inputBg: string;
  inputBorderColor: string;
  placeholderColor: string;
  textColor: string;
  subtleText: string;
  dividerColor: string;
  backgroundColor: string;
};

export default function ChatComposer({
  draft,
  editing,
  onDraftChange,
  onSend,
  onCancelEdit,
  sending,
  insets,
  inputBg,
  inputBorderColor,
  placeholderColor,
  textColor,
  subtleText,
  dividerColor,
  backgroundColor,
}: ChatComposerProps) {
  return (
    <>
      {editing && (
        <View
          className="flex-row items-center justify-between px-4 py-2"
          style={{
            backgroundColor: inputBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: dividerColor,
          }}
        >
          <Text style={{ color: subtleText }} className="text-sm flex-1">
            Editing message
          </Text>
          <Pressable onPress={onCancelEdit}>
            <Feather name="x" size={18} color={subtleText} />
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
        <ChatInputBar
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={onSend}
          sending={sending}
          insets={insets}
          inputBg={inputBg}
          inputBorderColor={inputBorderColor}
          placeholderColor={placeholderColor}
          textColor={textColor}
          subtleText={subtleText}
          dividerColor={dividerColor}
          backgroundColor={backgroundColor}
        />
      </KeyboardAvoidingView>
    </>
  );
}

import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { type EdgeInsets } from "react-native-safe-area-context";
import ChatInputBar from "./ChatInputBar";
import { type Message } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";

type ChatComposerProps = {
  draft: string;
  editing: boolean;
  replying: boolean;
  replyPreview?: Message | null;
  replySenderName?: string | null;
  onDraftChange: (text: string) => void;
  onSend: () => void;
  onCancelEdit: () => void;
  onCancelReply: () => void;
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
  replying,
  replyPreview,
  replySenderName,
  onDraftChange,
  onSend,
  onCancelEdit,
  onCancelReply,
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
  const replyText = replyPreview?.text ?? "";

  return (
    <>
      {replying && (
        <View
          className="flex-row items-center justify-between pl-4 pr-3 py-1.5"
          style={{
            backgroundColor: inputBg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: dividerColor,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              flex: 1,
              alignItems: "stretch",
              marginRight: 12,
            }}
          >
            <View
              style={{
                width: 2.5,
                borderRadius: 1.25,
                backgroundColor: BRAND_COLOR,
                opacity: 0.6,
              }}
            />
            <View style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather
                  name="corner-up-left"
                  size={10}
                  color={subtleText}
                />
                <Text
                  style={{ color: BRAND_COLOR, fontWeight: "600", fontSize: 12 }}
                  numberOfLines={1}
                >
                  {replySenderName ?? "Reply"}
                </Text>
              </View>
              <Text
                style={{ color: subtleText, fontSize: 11.5 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {replyText || "…"}
              </Text>
            </View>
          </View>
          <Pressable onPress={onCancelReply} hitSlop={8}>
            <Feather name="x" size={16} color={subtleText} />
          </Pressable>
        </View>
      )}
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

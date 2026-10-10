import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { type EdgeInsets } from "react-native-safe-area-context";
import ChatInputBar from "./ChatInputBar";
import { ReplyPreviewBanner } from "./ReplyPreviewBanner";
import { EditBanner } from "./EditBanner";
import { type Message } from "@/hooks/useChatMessages";

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
  showAttachmentOptions: boolean;
  setShowAttachmentOptions: React.Dispatch<React.SetStateAction<boolean>>;
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
  showAttachmentOptions,
  setShowAttachmentOptions,
}: ChatComposerProps) {
  return (
    <>
      {replying && (
        <ReplyPreviewBanner
          senderName={replySenderName}
          text={replyPreview?.text ?? ""}
          onCancel={onCancelReply}
        />
      )}
      {editing && <EditBanner onCancel={onCancelEdit} />}
      <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
        <ChatInputBar
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={onSend}
          sending={sending}
          insets={insets}
          showAttachmentOptions={showAttachmentOptions}
          setShowAttachmentOptions={setShowAttachmentOptions}
        />
      </KeyboardAvoidingView>
    </>
  );
}

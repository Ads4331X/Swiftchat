import { MessageActionSheet } from "./MessageActionSheet";
import { type Message } from "@/hooks/useChatMessages";

type ChatActionsProps = {
  message: Message | null;
  currentUserId: number | null;
  position: {
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null;
  textColor: string;
  bubbleColor: string;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward?: () => void;
  onPin?: () => void;
  onInfo?: () => void;
  onDismissStart?: () => void;
  onClose: () => void;
  isGroup: boolean;
  /** Whether pinning is allowed (group admins only; always true in 1:1). */
  canPin?: boolean;
};

export default function ChatActions({
  message,
  currentUserId,
  position,
  textColor,
  bubbleColor,
  isGroup,
  onEdit,
  onDelete,
  onReact,
  onReply,
  onForward,
  onInfo,
  onPin,
  onDismissStart,
  onClose,
  canPin = true,
}: ChatActionsProps) {
  return (
    <MessageActionSheet
      visible={!!message}
      isMine={message?.senderId === currentUserId}
      message={message}
      messageId={message?.id ?? 0}
      position={position}
      textColor={textColor}
      bubbleColor={bubbleColor}
      onEdit={onEdit}
      onDelete={onDelete}
      onReact={onReact}
      onReply={onReply}
      onForward={onForward}
      onPin={onPin}
      onInfo={onInfo}
      onDismissStart={onDismissStart}
      onClose={onClose}
      isGroup={isGroup}
      canPin={canPin}
    />
  );
}

import { MessageActionSheet } from "./MessageActionSheet";
import { type Position } from "@/components/chat/types";
import { type Message } from "@/types/message";

type ChatActionsProps = {
  message: Message | null;
  currentUserId: number | null;
  position: Position | null;
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

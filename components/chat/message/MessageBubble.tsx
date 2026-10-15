import { Keyboard, Image, Pressable, Text, View } from "react-native";
import { type Message, type RepliedTo } from "@/hooks/useChatMessages";
import { BRAND_COLOR } from "@/constants/theme";
import { memo, useEffect, useRef, useState } from "react";
import { type Position } from "@/components/chat/types";
import { MessageBubbleContent } from "./MessageBubbleContent";
import { ReactionChips } from "./ReactionChips";
import { useAttachment } from "@/hooks/useAttachment";
import AttachmentMessage from "../AttachmentMessage";
import { hasAttachment } from "@/lib/db/attachments";
import { formatBubbleTime } from "./utils";

export type MessageBubbleProps = {
  message: Message;
  conversationId: number;
  isMine: boolean;
  onLongPress: (position: Position) => void;
  hidden?: boolean;
  showAvatar?: boolean;
  avatarUrl?: string;
  otherUsername?: string;
  isGroup?: boolean;
  senderName?: string;
  hasAnyoneRead?: boolean;
  hasEveryoneRead?: boolean;
  onQuotePress?: (messageId: number) => void;
  highlighted?: boolean;
  isFirstInGroup?: boolean;

  /** Resolved quoted-message data (falls back to `message.repliedTo`). */
  repliedTo?: RepliedTo;
  replyToId?: number;

  /** ID of the original message this message was forwarded from. */
  forwardedFromMsgId?: number;
};

let keyboardVisible = false;
Keyboard.addListener("keyboardDidShow", () => {
  keyboardVisible = true;
});
Keyboard.addListener("keyboardDidHide", () => {
  keyboardVisible = false;
});

export default memo(function MessageBubble({
  message,
  isMine,
  onLongPress,
  hidden,
  showAvatar,
  avatarUrl,
  otherUsername,
  isGroup = false,
  senderName,
  hasAnyoneRead,
  hasEveryoneRead,
  onQuotePress,
  highlighted,
  repliedTo: repliedToProp,
  replyToId: replyToIdProp,
  conversationId,
  forwardedFromMsgId: forwardedFromMsgIdProp,
  isFirstInGroup,
}: MessageBubbleProps) {
  const bubbleRef = useRef<View>(null);
  const AVATAR_SIZE = 28;

  // render attachment immediately from the payload; fall back to a local
  // check only for legacy cached rows without a persisted attachment.
  const hasRemoteAttachment = message.attachment != null;
  const [hasLocalAttachment, setHasLocalAttachment] = useState(false);

  useEffect(() => {
    if (hasRemoteAttachment) return;
    let active = true;
    hasAttachment({ messageId: message.id }).then((local) => {
      if (active && local) setHasLocalAttachment(true);
    });
    return () => {
      active = false;
    };
  }, [message.id, hasRemoteAttachment]);

  const showAttachment = hasRemoteAttachment || hasLocalAttachment;

  const { sourceUri, mimeType, fileSize, status, progress } = useAttachment({
    conversationId,
    messageId: message.id,
    enabled: showAttachment,
  });

  // prefer loader mimeType, fall back to payload so the placeholder renders early.
  const attachmentMime = mimeType ?? message.attachment?.mimeType ?? null;

  // Attachment bubbles carry their own footer (timestamp, actions). Only draw
  // the text bubble when there is actual text or a quoted/forwarded context to
  // show, so image-only messages don't render an empty bubble next to the media.
  const repliedTo = repliedToProp ?? message.repliedTo;
  const forwardedFromMsgId =
    forwardedFromMsgIdProp ?? message.forwardedFromMsgId;
  const hasBody =
    message.text.trim().length > 0 ||
    Boolean(repliedTo) ||
    (replyToIdProp ?? message.replyToId) != null ||
    forwardedFromMsgId != null;

  const handleLongPress = () => {
    const measure = () => {
      bubbleRef.current?.measureInWindow(
        (pageX: number, pageY: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            onLongPress({ pageX, pageY, width, height });
          }
        },
      );
    };

    if (keyboardVisible) {
      const sub = Keyboard.addListener("keyboardDidHide", () => {
        sub.remove();
        measure();
      });
      Keyboard.dismiss();
    } else {
      measure();
    }
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={300}>
      <View
        className={`flex-row px-1 ${isMine ? "justify-end" : "justify-start"}`}
        style={{ marginTop: isFirstInGroup ? 10 : 2 }}
      >
        {/* Avatar space — only on other person's last-in-group message */}
        {!isMine ? (
          <View
            style={{
              width: AVATAR_SIZE + 4,
              justifyContent: "flex-end",
              alignItems: "center",
              marginRight: 2,
            }}
          >
            {showAvatar && avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                }}
              />
            ) : showAvatar ? (
              <View
                style={{
                  width: AVATAR_SIZE,
                  height: AVATAR_SIZE,
                  borderRadius: AVATAR_SIZE / 2,
                  backgroundColor: BRAND_COLOR,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}
                >
                  {otherUsername?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View
          ref={bubbleRef}
          style={{
            opacity: hidden ? 0 : 1,
            maxWidth: "80%",
            alignSelf: isMine ? "flex-end" : "flex-start",
            marginBottom:
              message.reactions && message.reactions.length > 0 ? 14 : 0,
          }}
        >
          {isGroup && !isMine && showAvatar && senderName ? (
            <Text
              className="text-xs font-semibold mb-0.5"
              style={{ color: BRAND_COLOR, paddingHorizontal: 4 }}
            >
              {senderName}
            </Text>
          ) : null}

          {showAttachment && attachmentMime ? (
            <AttachmentMessage
              attachment={{
                mimeType: attachmentMime,
                fileSize: fileSize ?? message.attachment?.fileSize ?? undefined,
              }}
              sourceUri={sourceUri}
              status={status === "idle" ? "downloading" : status}
              progress={progress}
              isMine={isMine}
              timeText={
                message.sentAt ? formatBubbleTime(message.sentAt) : undefined
              }
            />
          ) : null}
          {hasBody ? (
            <MessageBubbleContent
              text={message.text}
              isMine={isMine}
              editedAt={message.editedAt ?? undefined}
              sentAt={message.sentAt}
              isPending={message.id < 0}
              isRead={message.read}
              hasAnyoneRead={hasAnyoneRead}
              hasEveryoneRead={hasEveryoneRead}
              isGroup={isGroup}
              repliedTo={repliedTo}
              replyToId={replyToIdProp ?? message.replyToId}
              forwardedFromMsgId={forwardedFromMsgId}
              onQuotePress={onQuotePress}
              highlighted={highlighted}
            />
          ) : null}
          <ReactionChips reactions={message.reactions} isMine={isMine} />
        </View>
      </View>
    </Pressable>
  );
});

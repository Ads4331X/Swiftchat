import { useCallback, useState } from "react";
import {
  sendAttachment,
  type SendAttachment,
} from "@/features/chat/services/sendAttachment";
import { openChatAfterSend } from "@/features/chat/services/openChatAfterSend";

// compresses, encrypts and uploads picked attachments, then opens the chat on
// the last message that was sent.
export function useSendAttachments({
  conversationId,
}: {
  conversationId: number | null;
}) {
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async ({
      attachments = [],
      caption = "",
    }: {
      attachments?: SendAttachment[];
      caption?: string;
    }) => {
      if (conversationId == null) {
        console.warn("Attachment: no conversationId available");
        return;
      }
      if (!attachments.length) return;

      setSending(true);
      try {
        let lastMessageId: number | null = null;

        for (const attachment of attachments) {
          lastMessageId = await sendAttachment({
            attachment,
            conversationId,
            caption,
          });
        }

        if (lastMessageId != null) {
          await openChatAfterSend(conversationId, lastMessageId);
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  return { send, sending };
}

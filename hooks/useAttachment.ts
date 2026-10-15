import { useEffect, useState } from "react";
import {
  type AttachmentState,
  ensureAttachmentLoaded,
  getAttachmentState,
  subscribeAttachment,
} from "@/lib/chat/attachmentLoader";

// subscribes a bubble to the shared attachment loader.
export function useAttachment({
  conversationId,
  messageId,
  enabled,
}: {
  conversationId: number;
  messageId: number;
  enabled: boolean;
}) {
  const [state, setState] = useState<AttachmentState>(() =>
    getAttachmentState(messageId),
  );

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribeAttachment(messageId, setState);
    ensureAttachmentLoaded({ messageId, conversationId }).catch(() => {});

    return unsubscribe;
  }, [messageId, conversationId, enabled]);

  return {
    sourceUri: state.sourceUri,
    mimeType: state.mimeType,
    fileSize: state.fileSize,
    status: state.status,
    progress: state.progress,
  };
}

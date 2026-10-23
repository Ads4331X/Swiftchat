import { useEffect, useState } from "react";
import {
  type AttachmentState,
  ensureAttachmentLoaded,
  getAttachmentState,
  subscribeAttachment,
} from "@/features/chat/services/attachmentLoader";

// subscribes a bubble to the shared attachment loader.
export function useAttachment({
  conversationId,
  messageId,
  enabled,
  autoLoad = true,
}: {
  conversationId: number;
  messageId: number;
  enabled: boolean;
  autoLoad?: boolean;
}) {
  const [state, setState] = useState<AttachmentState>(() =>
    getAttachmentState(messageId),
  );

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribeAttachment(messageId, setState);
    if (autoLoad) {
      ensureAttachmentLoaded({ messageId, conversationId }).catch(() => {});
    }

    return unsubscribe;
  }, [messageId, conversationId, enabled, autoLoad]);

  return {
    sourceUri: state.sourceUri,
    mimeType: state.mimeType,
    fileSize: state.fileSize,
    waveform: state.waveform,
    durationMs: state.durationMs,
    status: state.status,
    progress: state.progress,
  };
}

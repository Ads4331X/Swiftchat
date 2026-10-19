import { useMemo } from "react";
import type { AttachmentMessageProps } from "@/features/attachments/components/attachment/types";
import { kindFromMime } from "@/features/attachments/components/attachment/utils";
import { MediaAttachment } from "@/features/attachments/components/attachment/MediaAttachment";
import { VoiceAttachment } from "@/features/attachments/components/attachment/VoiceAttachment";
import { DocumentAttachment } from "@/features/attachments/components/attachment/DocumentAttachment";

export function AttachmentMessage({
  attachment,
  status = "idle",
  progress = 0,
  sourceUri,
  thumbnailUri,
  isMine = false,
  timeText,
  seed,
  onDownload,
  onOpen,
}: AttachmentMessageProps) {
  const kind = useMemo(
    () => kindFromMime(attachment.mimeType),
    [attachment.mimeType],
  );

  if (kind === "audio") {
    return (
      <VoiceAttachment
        attachment={attachment}
        status={status}
        progress={progress}
        isMine={isMine}
        timeText={timeText}
        seed={seed}
        onDownload={onDownload}
        onOpen={onOpen}
        sourceUri={sourceUri ?? null}
      />
    );
  }

  if (kind === "document") {
    return (
      <DocumentAttachment
        attachment={attachment}
        status={status}
        progress={progress}
        isMine={isMine}
        timeText={timeText}
        sourceUri={sourceUri ?? null}
        onDownload={onDownload}
        onOpen={onOpen}
      />
    );
  }

  return (
    <MediaAttachment
      attachment={attachment}
      kind={kind}
      status={status}
      progress={progress}
      sourceUri={sourceUri}
      thumbnailUri={thumbnailUri}
      isMine={isMine}
      timeText={timeText}
      onDownload={onDownload}
      onOpen={onOpen}
    />
  );
}

export default AttachmentMessage;

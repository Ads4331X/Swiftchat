import { useMemo } from "react";
import type { AttachmentMessageProps } from "./types";
import { kindFromMime } from "./utils";
import { MediaAttachment } from "./MediaAttachment";
import { VoiceAttachment } from "./VoiceAttachment";
import { DocumentAttachment } from "./DocumentAttachment";

export function AttachmentMessage({
  attachment,
  status = "idle",
  progress = 0,
  sourceUri,
  thumbnailUri,
  isMine = false,
  timeText,
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
        onDownload={onDownload}
        onOpen={onOpen}
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

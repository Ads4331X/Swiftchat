export type AttachmentKind = "image" | "video" | "audio" | "document";

export type AttachmentStatus =
  | "idle"
  | "downloading"
  | "processing"
  | "ready"
  | "error";

export type AttachmentMeta = {
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  durationMs?: number;
  width?: number;
  height?: number;
};

export type AttachmentMessageProps = {
  attachment: AttachmentMeta;
  status?: AttachmentStatus;
  progress?: number;
  sourceUri?: string | null;
  thumbnailUri?: string | null;
  isMine?: boolean;
  timeText?: string;
  onDownload?: () => void;
  onOpen?: () => void;
};

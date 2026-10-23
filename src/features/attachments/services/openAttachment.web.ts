import type { OpenAttachmentArgs } from "./openAttachment.types";

function canPreview(mimeType: string | null | undefined) {
  if (!mimeType) return false;

  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/")
  );
}

export async function openAttachment({
  uri,
  mimeType,
  fileName,
}: OpenAttachmentArgs) {
  if (!uri) {
    throw new Error("Attachment is not available");
  }

  const link = document.createElement("a");
  link.href = uri;
  link.rel = "noopener noreferrer";

  if (canPreview(mimeType)) {
    link.target = "_blank";
  } else {
    link.download = fileName ?? "document";
  }

  link.click();
}

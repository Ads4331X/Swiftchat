import { compressImage, compressVideo } from "@/features/attachments/services/media";
import { safeDelete } from "@/core/storage/tempFiles";
import { uploadAttachment } from "@/features/chat/services/uploadAttachment";

export type SendAttachment = {
  uri: string;
  kind: "image" | "video" | "audio" | "document";
  width?: number | null;
  height?: number | null;
  size?: number | null;
  mimeType?: string | null;
  waveform?: number[];
  durationMs?: number;
};

// compresses the file to the size limits before it is encrypted, then uploads
// it. falls back to the original when compression is unavailable.
export async function sendAttachment({
  attachment,
  conversationId,
  caption,
}: {
  attachment: SendAttachment;
  conversationId: number;
  caption?: string;
}) {
  const { uri, waveform, durationMs } = attachment;
  const readyUri = await compressAttachment(attachment);

  try {
    return await uploadAttachment({
      uri: readyUri,
      conversationId,
      caption,
      waveform,
      durationMs,
    });
  } finally {
    // the compressed copy is a throwaway, the encrypted file is what we keep
    if (readyUri !== uri) safeDelete(readyUri);
  }
}

async function compressAttachment(attachment: SendAttachment) {
  const { uri, kind, width, height, size, mimeType } = attachment;

  // audio and documents are sent as-is, only media gets compressed
  if (kind !== "image" && kind !== "video") return uri;
  if (width == null || height == null || size == null) return uri;

  try {
    const result =
      kind === "video"
        ? await compressVideo({
            uri,
            width,
            height,
            size,
            mimeType: mimeType ?? "video/mp4",
          })
        : await compressImage({ uri, width, height, size });
    return result.uri;
  } catch (error) {
    console.warn(
      `Attachment: ${kind} compression failed, sending original`,
      error,
    );
    return uri;
  }
}

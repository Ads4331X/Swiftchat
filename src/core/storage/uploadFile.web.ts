import { checkAndCreateEncryptedFile } from "@/core/storage/attachmentFile.web";

export function appendEncryptedFile(
  formData: FormData,
  { uuid, mimeType }: { uuid: string; mimeType?: string },
) {
  const blob = checkAndCreateEncryptedFile(uuid).getBlob();

  // Re-wrap so the part carries the source mime type (the server rejects
  // unknown types); the stored encrypted blob is always octet-stream.
  const typed =
    mimeType && mimeType !== blob.type
      ? new Blob([blob], { type: mimeType })
      : blob;

  formData.append("file", typed, "encrypted-image.bin");
}

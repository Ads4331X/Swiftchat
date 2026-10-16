export function appendEncryptedFile(
  formData: FormData,
  { uri, mimeType }: { uri: string; uuid: string; mimeType?: string },
) {
  formData.append("file", {
    uri,
    name: "encrypted-image.bin",
    // The server categorises attachments by mime type and rejects unknown ones,
    // so forward the source file's type (image/jpeg, video/mp4, ...).
    type: mimeType ?? "application/octet-stream",
  } as any);
}

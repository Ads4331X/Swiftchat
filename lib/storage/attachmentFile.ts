import { Directory, File, FileHandle, Paths } from "expo-file-system";

const attachmentDir = new Directory(Paths.document, "attachments", "encrypted");

export function createAttachmentFile() {
  const id = crypto.randomUUID();
  const file = new File(attachmentDir, `${id}.bin`);

  return file;
}

export function writeAttachmentChunk({
  handle,
  encryptedChunk,
}: {
  handle: FileHandle;
  encryptedChunk: Uint8Array;
}) {
  const lengthBytes = new Uint8Array(4); // 256 ^ 4 no of 4 bytes are available
  // stores the chunk size in lengthBytes
  new DataView(lengthBytes.buffer).setUint32(
    0,
    encryptedChunk.byteLength,
    true,
  );

  handle.writeBytes(lengthBytes); // 4 bytes: size of the chunk that follows
  handle.writeBytes(encryptedChunk); // the chunk itself
}

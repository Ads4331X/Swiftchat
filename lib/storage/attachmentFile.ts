import { Directory, File, FileHandle, Paths } from "expo-file-system";

const attachmentDir = new Directory(Paths.document, "attachments", "encrypted");
const cacheDir = new Directory(Paths.cache, "attachments", "cache");

export function createAttachmentFile() {
  const id = crypto.randomUUID();
  const file = new File(attachmentDir, `${id}.bin`);

  return { file, uuid: id };
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

export function openAttachmentFile({ localPath }: { localPath: string }) {
  const attachment = new File(localPath);

  return attachment.open();
}

export function createAttachmentCacheFile(uuid: string, mimeType: string) {
  const type = mimeType.split("/");
  const file = new File(cacheDir, `${uuid}.${type[type.length - 1]}`);
  return file;
}

export function writeAttachmentCacheChunk({
  handle,
  chunk,
}: {
  handle: FileHandle;
  chunk: Uint8Array;
}) {
  handle.writeBytes(chunk); // the chunk itself
}

export function checkAndCreateEncryptedFile(uuid: string) {
  const file = new File(attachmentDir, `${uuid}.bin`);
  return file;
}

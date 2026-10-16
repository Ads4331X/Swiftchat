import { Directory, File, FileHandle, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";

const attachmentDir = new Directory(Paths.document, "attachments", "encrypted");
const cacheDir = new Directory(Paths.cache, "attachments", "cache");

// `File.open()` fails with ENOENT when the parent directory (or on iOS the
// file itself) does not exist yet, so make sure both are present before writing.
function ensureFile(file: File, dir: Directory) {
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  if (!file.exists) {
    file.create({ intermediates: true });
  }
}

export function createAttachmentFile() {
  const uuid = Crypto.randomUUID();
  const file = new File(attachmentDir, `${uuid}.bin`);

  return {
    file: {
      uri: file.uri,

      get size() {
        return file.size;
      },

      open() {
        ensureFile(file, attachmentDir);
        return file.open();
      },
    },
    uuid,
  };
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

  return {
    uri: file.uri,
    type: mimeType,

    get size() {
      return file.size;
    },

    get exists() {
      return file.exists;
    },

    open() {
      ensureFile(file, cacheDir);
      return file.open();
    },
    delete() {
      if (file.exists) {
        file.delete();
      }
    },
  };
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

  return {
    uri: file.uri,

    get size() {
      return file.size;
    },

    get exists() {
      return file.exists;
    },

    open() {
      ensureFile(file, attachmentDir);
      return file.open();
    },
  };
}

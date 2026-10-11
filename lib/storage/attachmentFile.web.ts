import * as Crypto from "expo-crypto";

const encryptedFiles = new Map<string, Blob>();
const cacheFiles = new Map<string, Blob>();

export function createAttachmentFile() {
  const uuid = Crypto.randomUUID();
  const chunks: BlobPart[] = [];

  const file = {
    uri: `web-attachment://${uuid}`,

    get size() {
      return encryptedFiles.get(uuid)?.size ?? 0;
    },

    open() {
      return {
        writeBytes(bytes: Uint8Array) {
          chunks.push(bytes.slice().buffer as ArrayBuffer);
        },

        close() {
          encryptedFiles.set(
            uuid,
            new Blob(chunks, {
              type: "application/octet-stream",
            }),
          );
        },
      };
    },

    async getBlob() {
      const blob = encryptedFiles.get(uuid);

      if (!blob) {
        throw new Error("Encrypted attachment not found");
      }

      return blob;
    },
  };

  return { file, uuid };
}

export function writeAttachmentChunk({
  handle,
  encryptedChunk,
}: {
  handle: {
    writeBytes: (bytes: Uint8Array) => void;
  };
  encryptedChunk: Uint8Array;
}) {
  const lengthBytes = new Uint8Array(4);

  new DataView(lengthBytes.buffer).setUint32(
    0,
    encryptedChunk.byteLength,
    true,
  );

  handle.writeBytes(lengthBytes);
  handle.writeBytes(encryptedChunk);
}

export function createAttachmentCacheFile(uuid: string, mimeType: string) {
  const chunks: BlobPart[] = [];
  let cacheBlob: Blob | null = null;
  let objectUrl: string | null = null;

  const resolveBlob = () => cacheBlob ?? cacheFiles.get(uuid) ?? null;

  const file = {
    type: mimeType,
    mimeType,

    // browser URL the UI can render once the decrypted Blob exists
    get uri() {
      if (!objectUrl) {
        const blob = resolveBlob();
        if (blob) objectUrl = URL.createObjectURL(blob);
      }

      return objectUrl ?? `web-cache://${uuid}`;
    },

    get size() {
      return resolveBlob()?.size ?? 0;
    },

    get exists() {
      return resolveBlob() !== null;
    },

    open() {
      return {
        writeBytes(bytes: Uint8Array) {
          chunks.push(bytes.slice().buffer as ArrayBuffer);
        },

        close() {
          cacheBlob = new Blob(chunks, { type: mimeType });
          cacheFiles.set(uuid, cacheBlob);
        },
      };
    },

    async getBlob() {
      const blob = resolveBlob();

      if (!blob) {
        throw new Error("Decrypted attachment not found");
      }

      return blob;
    },
  };

  return file;
}

export async function openAttachmentFile({ localPath }: { localPath: string }) {
  const uuid = localPath.replace("web-attachment://", "");
  const blob = encryptedFiles.get(uuid);

  if (!blob) {
    throw new Error("Encrypted attachment not found in browser memory");
  }

  let offset = 0;

  return {
    async readBytes(length: number): Promise<Uint8Array> {
      if (offset + length > blob.size) {
        throw new Error("Unexpected end of encrypted attachment");
      }

      const buffer = await blob.slice(offset, offset + length).arrayBuffer();

      offset += length;

      return new Uint8Array(buffer);
    },

    close() {},
  };
}

export function writeAttachmentCacheChunk({
  handle,
  chunk,
}: {
  handle: {
    writeBytes: (bytes: Uint8Array) => void;
  };
  chunk: Uint8Array;
}) {
  handle.writeBytes(chunk);
}

export function checkAndCreateEncryptedFile(uuid: string) {
  const chunks: BlobPart[] = [];
  let blob: Blob | null = null;

  return {
    uri: `web-attachment://${uuid}`,

    get size() {
      return (blob ?? encryptedFiles.get(uuid))?.size ?? 0;
    },

    get exists() {
      return encryptedFiles.has(uuid);
    },

    open() {
      return {
        writeBytes(bytes: Uint8Array) {
          chunks.push(bytes.slice().buffer as ArrayBuffer);
        },

        close() {
          blob = new Blob(chunks, { type: "application/octet-stream" });
          encryptedFiles.set(uuid, blob);
        },
      };
    },

    getBlob() {
      const resolved = blob ?? encryptedFiles.get(uuid);

      if (!resolved) {
        throw new Error("Encrypted attachment not found");
      }

      return resolved;
    },
  };
}

import { FileHandle } from "expo-file-system";

export async function createChunk({
  bufferSize = 1024 * 1024, // 1MB
  reader,
}: {
  bufferSize: number;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}): Promise<{ chunk: Uint8Array; isFinal: boolean }> {
  let bufferBytes = 0; // keeps track of the total bytes read
  let buffer: Uint8Array[] = []; // keeps track of the chunks read
  while (true) {
    const readFile = await reader.read(); // reads a chunk

    if (readFile.value) {
      buffer.push(readFile.value); // adds chunk to the buffer
    }
    bufferBytes += readFile.value?.byteLength || 0; // adds the chunk size to the total current buffer size
    let mergeChunk: Uint8Array = mergeChunks(buffer, bufferBytes);
    if (readFile.done) return { chunk: mergeChunk, isFinal: true };
    if (bufferSize <= bufferBytes) {
      return { chunk: mergeChunk, isFinal: false };
    }
  }
}

function mergeChunks(buffer: Uint8Array[], totalBytes: number): Uint8Array {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const piece of buffer) {
    merged.set(piece, offset);
    offset += piece.byteLength;
  }
  return merged;
}

export async function readChunk({
  attachmentHandle,
}: {
  attachmentHandle: FileHandle;
}) {
  // read chunk length
  const lengthBytes = await attachmentHandle.readBytes(4);

  // convert 4 bytes to number
  const chunkLength = new DataView(
    lengthBytes.buffer,
    lengthBytes.byteOffset,
    lengthBytes.byteLength,
  ).getUint32(0, true);

  // read encrypted chunk
  const encryptedChunk = await attachmentHandle.readBytes(chunkLength);

  return encryptedChunk;
}

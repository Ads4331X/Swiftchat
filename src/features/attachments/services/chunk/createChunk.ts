export async function createChunk({
  bufferSize = 1024 * 1024, // 1MB
  reader,
}: {
  bufferSize: number;
  reader: ReadableStreamDefaultReader<Uint8Array>;
}): Promise<{ chunk: Uint8Array; isFinal: boolean }> {
  let bufferBytes = 0; // keeps track of the total bytes read
  const buffer: Uint8Array[] = []; // keeps track of the chunks read

  while (true) {
    const readFile = await reader.read(); // reads a chunk

    if (readFile.value) {
      buffer.push(readFile.value); // adds chunk to the buffer
      bufferBytes += readFile.value.byteLength; // adds the chunk size to the total current buffer size
    }

    // Merge once, only when we are about to return. Merging on every read
    // re-copied the whole buffer each time (O(n^2)) and caused GC churn.
    if (readFile.done) {
      return { chunk: mergeChunks(buffer, bufferBytes), isFinal: true };
    }
    if (bufferSize <= bufferBytes) {
      return { chunk: mergeChunks(buffer, bufferBytes), isFinal: false };
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

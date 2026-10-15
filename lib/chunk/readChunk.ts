const MAX_ENCRYPTED_CHUNK_SIZE = 1024 * 1024 + 16;

export async function readChunk({
  attachmentHandle,
}: {
  attachmentHandle: {
    readBytes: (length: number) => Uint8Array | Promise<Uint8Array>;
  };
}): Promise<Uint8Array | null> {
  // Read the 4-byte chunk length prefix.
  const lengthBytes = await attachmentHandle.readBytes(4);

  // Clean EOF: no bytes remain.
  if (lengthBytes.byteLength === 0) {
    return null;
  }

  if (lengthBytes.byteLength !== 4) {
    throw new Error("Invalid encrypted chunk length");
  }

  // Convert the 4 bytes to a number.
  const chunkLength = new DataView(
    lengthBytes.buffer,
    lengthBytes.byteOffset,
    lengthBytes.byteLength,
  ).getUint32(0, true);

  // Reject empty or oversized chunks before reading their contents.
  if (chunkLength < 16 || chunkLength > MAX_ENCRYPTED_CHUNK_SIZE) {
    throw new Error("Invalid encrypted chunk size");
  }

  // Read the complete encrypted chunk.
  const encryptedChunk = await attachmentHandle.readBytes(chunkLength);

  if (encryptedChunk.byteLength !== chunkLength) {
    throw new Error("Incomplete encrypted chunk");
  }

  return encryptedChunk;
}

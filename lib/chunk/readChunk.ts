export async function readChunk({
  attachmentHandle,
}: {
  attachmentHandle: {
    readBytes: (length: number) => Uint8Array | Promise<Uint8Array>;
  };
}): Promise<Uint8Array> {
  // read the 4-byte chunk length prefix
  const lengthBytes = await attachmentHandle.readBytes(4);

  if (lengthBytes.byteLength !== 4) {
    throw new Error("Invalid encrypted chunk length");
  }

  // convert 4 bytes to number
  const chunkLength = new DataView(
    lengthBytes.buffer,
    lengthBytes.byteOffset,
    lengthBytes.byteLength,
  ).getUint32(0, true);

  if (chunkLength === 0) {
    throw new Error("Invalid encrypted chunk size");
  }

  // read encrypted chunk
  const encryptedChunk = await attachmentHandle.readBytes(chunkLength);

  if (encryptedChunk.byteLength !== chunkLength) {
    throw new Error("Incomplete encrypted chunk");
  }

  return encryptedChunk;
}

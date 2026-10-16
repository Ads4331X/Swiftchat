export async function openSourceFile(uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();

  return {
    reader: blob.stream().getReader(),
    mimeType: blob.type || "application/octet-stream",
  };
}

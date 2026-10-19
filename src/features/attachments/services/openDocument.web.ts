export function openDocument({
  uri,
}: {
  uri: string;
  mimeType?: string | null;
}): Promise<void> {
  window.open(uri, "_blank");
  return Promise.resolve();
}

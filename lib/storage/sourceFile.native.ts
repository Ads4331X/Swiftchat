import { File } from "expo-file-system";

export async function openSourceFile(uri: string) {
  const file = new File(uri);

  return {
    reader: file.readableStream().getReader(),
    mimeType: file.type,
  };
}

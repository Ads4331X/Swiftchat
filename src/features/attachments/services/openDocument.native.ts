import { Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";

export async function openDocument({
  uri,
  mimeType,
}: {
  uri: string;
  mimeType?: string | null;
}): Promise<void> {
  const path = uri.replace(/^file:\/\//, "");

  if (Platform.OS === "android") {
    await ReactNativeBlobUtil.android.actionViewIntent(path, mimeType || "*/*");
    return;
  }

  await ReactNativeBlobUtil.ios.openDocument(path);
}

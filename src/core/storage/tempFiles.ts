import { File } from "expo-file-system";

// deletes a local file, ignoring missing or unreadable paths.
// blob:/http(s): urls (web) are not files on disk.
export function safeDelete(path?: string) {
  if (!path?.startsWith("file://")) return;
  try {
    const file = new File(path);
    if (file.exists) file.delete();
  } catch {
    // file already gone or not deletable, nothing to do
  }
}

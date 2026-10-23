import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { OpenAttachmentArgs } from "./openAttachment.types";

export async function openAttachment({
  uri,
  mimeType,
  fileName,
}: OpenAttachmentArgs) {
  if (!uri) {
    throw new Error("Attachment is not available");
  }

  const sharingOptions = {
    mimeType: mimeType ?? undefined,
    dialogTitle: fileName ?? "Open document",
  };

  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      const IntentLauncher = await import("expo-intent-launcher");
      await IntentLauncher.startActivityAsync(
        "android.intent.action.VIEW",
        {
          data: contentUri,
          type: mimeType ?? "*/*",
          flags: 1,
        },
      );
      return;
    } catch (openError) {
      if (!(await Sharing.isAvailableAsync())) {
        throw openError;
      }
      await Sharing.shareAsync(uri, sharingOptions);
      return;
    }
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Opening files is not supported on this device");
  }

  await Sharing.shareAsync(uri, sharingOptions);
}

import { File, Directory, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { setLocalAvatarUrlPath } from "@/core/db";

export async function downloadAvatar({
  url,
  userId,
}: {
  url: string;
  userId: number;
}) {
  if (Platform.OS === "web") {
    return null;
  }

  const cacheDirectory = new Directory(Paths.cache, "users-avatar-images");

  try {
    cacheDirectory.create({
      idempotent: true,
      intermediates: true,
    });

    const filename = `${userId}-${Date.now()}.jpg`;
    const destination = new File(cacheDirectory, filename);

    const output = await File.downloadFileAsync(url, destination, {
      idempotent: true,
    });

    if (output.exists) {
      await setLocalAvatarUrlPath({
        url: output.uri,
        userId,
      });

      return output.uri;
    }

    return null;
  } catch (error) {
    console.log("Avatar download error:", error);
    return null;
  }
}

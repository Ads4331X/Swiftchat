import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export async function compressAvatarImage({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  if (width <= 1024 && height <= 1024) {
    return uri;
  }

  const context = ImageManipulator.manipulate(uri);

  const manipulated = await context.resize({ width: 1024 }).renderAsync();

  const result = await manipulated.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.8,
  });

  context.release();
  manipulated.release();

  return result.uri;
}

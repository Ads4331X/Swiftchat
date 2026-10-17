import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_QUALITIES = [0.95, 0.9, 0.85, 0.8, 0.7];

type CompressResult = {
  uri: string;
  compressedSize: number;
  width: number;
  height: number;
  quality: number;
};

async function tryCompressImage(manipulated: any, maxSize: number) {
  let lastResult: CompressResult | undefined;

  for (const quality of IMAGE_QUALITIES) {
    const result = await manipulated.saveAsync({
      format: SaveFormat.JPEG,
      compress: quality,
    });

    const file = new File(result.uri);
    const compressedSize = file.size;

    if (compressedSize === undefined) {
      throw new Error("Could not read compressed file size");
    }

    lastResult = {
      uri: result.uri,
      compressedSize,
      width: result.width,
      height: result.height,
      quality,
    };

    if (compressedSize <= maxSize) {
      return { success: true, ...lastResult };
    }
    file.delete();
  }

  return { success: false, ...lastResult! };
}

// resizes and recompresses an image until it is within the size limits.
export async function compressImage({
  uri,
  width,
  height,
  size,
  maxSize = IMAGE_SIZE_LIMIT,
  maxDimension = IMAGE_MAX_DIMENSION,
}: {
  uri: string;
  width: number;
  height: number;
  size: number;
  maxSize?: number;
  maxDimension?: number;
}) {
  if (size <= maxSize && Math.max(width, height) <= maxDimension) {
    return { uri, compressedSize: size, width, height, quality: 1 };
  }

  // resizes the longest side
  let resizeAction =
    width >= height ? { width: maxDimension } : { height: maxDimension };
  const manipulated = await ImageManipulator.manipulate(uri)
    .resize(resizeAction)
    .renderAsync();

  let result = await tryCompressImage(manipulated, maxSize);

  // if the image is still over the limit, keep shrinking the dimensions.
  // scale factor = sqrt(size limit / current size) with a 0.9 safety margin
  let rounds = 0;
  while (!result.success && rounds < 5) {
    const prevUri = result.uri;
    const scaleFactor = Math.sqrt(maxSize / result.compressedSize) * 0.9;

    resizeAction =
      result.width >= result.height
        ? { width: Math.max(Math.floor(result.width * scaleFactor), 320) }
        : { height: Math.max(Math.floor(result.height * scaleFactor), 320) };

    const manipulated = await ImageManipulator.manipulate(uri)
      .resize(resizeAction)
      .renderAsync();
    result = await tryCompressImage(manipulated, maxSize);
    rounds++;

    // delete the previous round's output
    const oldFile = new File(prevUri);
    oldFile.delete();
  }

  return result;
}

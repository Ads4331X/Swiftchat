import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

const ImageSizeLimit = 10 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 1600;
const VideoSizeLimit = 200 * 1024 * 1024;
const VIDEO_MAX_WIDTH = 1920;
const VIDEO_MAX_HEIGHT = 1080;
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
export async function compressImage({
  uri,
  width,
  height,
  size,
  maxSize = ImageSizeLimit,
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
  } // resizes the longest side
  let resizeAction =
    width >= height ? { width: maxDimension } : { height: maxDimension };
  const manipulated = await ImageManipulator.manipulate(uri)
    .resize(resizeAction)
    .renderAsync();

  let result = await tryCompressImage(manipulated, maxSize);
  // if image is still greater then the size limit and alr compressed to max good qualtiy
  // shrinking the dimensions
  let rounds = 0;
  while (!result.success && rounds < 5) {
    const prevUri = result.uri;
    // scale factor formula =  square root of (size limit / current size (compressed size) ) approx size
    const scaleFactor = Math.sqrt(maxSize / result.compressedSize) * 0.9; // 0.9 is safety limit to make size with in limit

    resizeAction =
      result.width >= result.height
        ? { width: Math.max(Math.floor(result.width * scaleFactor), 320) }
        : { height: Math.max(Math.floor(result.height * scaleFactor), 320) };

    const manipulated = await ImageManipulator.manipulate(uri)
      .resize(resizeAction)
      .renderAsync();
    result = await tryCompressImage(manipulated, maxSize);
    rounds++;

    // deletes the old (prev) image that is returned
    const oldFile = new File(prevUri);
    oldFile.delete();
  }

  return result;
}

async function tryCompressVideo(uri: string, maxSize: number) {
  // compress the vid to HEVC
  const { compress } = await import("expo-image-and-video-compressor");
  const result = await compress(uri, {
    codec: "h264",
    speed: "fast",
    bitrate: 2_000_000, // 2 Mbps
    maxSize: maxSize,
  });
  return result;
}
export async function compressVideo({
  uri,
  width,
  height,
  size,
  mimeType,
}: {
  uri: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}) {
  let result: string;
  let quality: number;

  // if video is alr fulfilling the requirments
  if (
    size <= VideoSizeLimit &&
    width <= VIDEO_MAX_WIDTH &&
    height <= VIDEO_MAX_HEIGHT &&
    mimeType === "video/mp4"
  )
    return {
      uri,
      width,
      height,
      compressedSize: size,
      quality: 1,
    };

  // compress the vid to HEVC
  const result1080 = await tryCompressVideo(uri, 1080);
  const size1080 = new File(result1080).size;

  if (size1080 === undefined) {
    throw new Error("Could not read compressed video size");
  }

  // if compression makes the video within the max limit 100mb
  if (size1080 <= VideoSizeLimit) {
    result = result1080; // final result
    quality = 1080;
  } else {
    // deleting the old compressed video
    const oldFile = new File(result1080);
    oldFile.delete();
    const result720 = await tryCompressVideo(uri, 720);
    result = result720; // final result
    quality = 720;
  }

  const compressedSize = new File(result).size;

  return {
    uri: result,
    width,
    height,
    compressedSize,
    quality,
  };
}

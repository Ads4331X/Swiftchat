import { File } from "expo-file-system";

const VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;
const VIDEO_MAX_WIDTH = 1920;
const VIDEO_MAX_HEIGHT = 1080;

async function tryCompressVideo(uri: string, maxSize: number) {
  const { compress } = await import("expo-image-and-video-compressor");
  const result = await compress(uri, {
    codec: "h264",
    speed: "fast",
    bitrate: 2_000_000, // 2 Mbps
    maxSize: maxSize,
  });
  return result;
}

// recompresses a video to 1080p (falling back to 720p) until it is
// within the size limits.
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

  // already within limits
  if (
    size <= VIDEO_SIZE_LIMIT &&
    width <= VIDEO_MAX_WIDTH &&
    height <= VIDEO_MAX_HEIGHT &&
    mimeType === "video/mp4"
  ) {
    return {
      uri,
      width,
      height,
      compressedSize: size,
      quality: 1,
    };
  }

  const result1080 = await tryCompressVideo(uri, 1080);
  const size1080 = new File(result1080).size;

  if (size1080 === undefined) {
    throw new Error("Could not read compressed video size");
  }

  if (size1080 <= VIDEO_SIZE_LIMIT) {
    result = result1080;
    quality = 1080;
  } else {
    // 1080p is still too big, drop the temp file and try 720p
    const oldFile = new File(result1080);
    oldFile.delete();
    result = await tryCompressVideo(uri, 720);
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

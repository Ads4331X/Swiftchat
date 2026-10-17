import { safeDelete } from "@/core/storage/tempFiles";
import type { ReviewAsset } from "@/features/attachments/components/review/types";

export { safeDelete };

function isReviewAsset(asset: unknown): asset is ReviewAsset {
  return (
    typeof asset === "object" &&
    asset !== null &&
    "uri" in asset &&
    typeof asset.uri === "string" &&
    asset.uri.length > 0 &&
    (!("type" in asset) ||
      asset.type === null ||
      typeof asset.type === "string") &&
    (!("mimeType" in asset) ||
      asset.mimeType === null ||
      typeof asset.mimeType === "string")
  );
}

export function parseAssets(value?: string | string[]): ReviewAsset[] {
  if (typeof value !== "string") return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      console.warn("AttachmentReview: assets parameter is not an array");
      return [];
    }

    const assets = parsed.filter(isReviewAsset);
    if (assets.length !== parsed.length) {
      console.warn("AttachmentReview: ignored invalid media assets");
    }
    return assets;
  } catch (error) {
    console.warn("AttachmentReview: could not parse assets parameter", error);
    return [];
  }
}

export function isVideoAsset(asset?: ReviewAsset) {
  return asset?.type === "video" || asset?.mimeType?.startsWith("video/") === true;
}

// deletes a temp file unless it's one we still need (the original or a picked asset)
export function deleteTempFile(
  uri: string | undefined,
  keep: (string | undefined)[],
) {
  if (!uri || keep.includes(uri)) return;
  safeDelete(uri);
}

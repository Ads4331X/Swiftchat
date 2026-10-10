import { Feather } from "@expo/vector-icons";
import { Dimensions } from "react-native";
import type { AttachmentKind, AttachmentStatus } from "./types";

export type FeatherName = React.ComponentProps<typeof Feather>["name"];

export const MEDIA_WIDTH = Math.min(
  260,
  Math.round(Dimensions.get("window").width * 0.66),
);

export const WAVEFORM = [
  9, 15, 11, 19, 24, 13, 17, 25, 15, 10, 21, 27, 16, 12, 23, 19, 11, 14, 21,
  17, 9, 13, 19, 25, 15, 11, 17, 23, 13, 19,
];

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function percent(progress: number): number {
  return Math.round(Math.max(0, Math.min(1, progress)) * 100);
}

export function kindFromMime(mimeType: string): AttachmentKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

export function resolveAspect(
  width: number | undefined,
  height: number | undefined,
  fallback: number,
): number {
  if (width && height) return width / height;
  return fallback;
}

export function clampMediaHeight(width: number, aspect: number): number {
  return Math.max(150, Math.min(300, Math.round(width / aspect)));
}

export function documentVisual(
  mimeType: string,
  fileName?: string,
): { icon: FeatherName; color: string } {
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  if (mimeType === "application/pdf" || ext === "pdf")
    return { icon: "file-text", color: "#E5484D" };
  if (mimeType.includes("zip") || ["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return { icon: "archive", color: "#F5A623" };
  if (mimeType.includes("word") || ["doc", "docx", "rtf"].includes(ext))
    return { icon: "file-text", color: "#2B6CB0" };
  if (mimeType.includes("sheet") || ["xls", "xlsx", "csv"].includes(ext))
    return { icon: "grid", color: "#2F855A" };
  if (mimeType.includes("presentation") || ["ppt", "pptx"].includes(ext))
    return { icon: "monitor", color: "#DD6B20" };
  if (mimeType.startsWith("text/") || ["txt", "md", "log"].includes(ext))
    return { icon: "file-text", color: "#4A5568" };
  return { icon: "file", color: "#29A195" };
}

export function statusSubtitle(
  status: AttachmentStatus,
  progress: number,
  readyText: string,
): string {
  if (status === "downloading") return `Downloading… ${percent(progress)}%`;
  if (status === "processing") return "Decrypting…";
  if (status === "error") return "Download failed · tap to retry";
  return readyText;
}

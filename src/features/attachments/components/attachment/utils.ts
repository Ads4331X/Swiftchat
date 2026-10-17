import { Feather } from "@expo/vector-icons";
import { Dimensions } from "react-native";
import type { AttachmentKind, AttachmentStatus } from "@/features/attachments/components/attachment/types";

export type FeatherName = React.ComponentProps<typeof Feather>["name"];

export const MEDIA_WIDTH = Math.min(
  260,
  Math.round(Dimensions.get("window").width * 0.66),
);

const BAR_COUNT = 30;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 28;

/** Scale 0..1 levels so the loudest moment hits 100, quantized to ints. */
export function normalizeSamples(samples: number[]): number[] {
  if (samples.length === 0) return [];
  const peak = Math.max(...samples, 0.05);
  return samples.map((s) => Math.round((s / peak) * 100));
}

function toHeight(level: number): number {
  const clamped = Math.max(0, Math.min(1, level));
  return Math.round(MIN_BAR_HEIGHT + clamped * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
}

/**
 * Shrink a normalized waveform (0..100) to 30 bar heights (3..28 px).
 * Falls back to a deterministic seeded pattern for old messages.
 */
export function resolveWaveform(
  waveform: number[] | undefined,
  seed: number,
): number[] {
  if (!waveform?.length) return placeholderWaveform(seed);

  const step = waveform.length / BAR_COUNT;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end; j++) sum += waveform[j];
    return toHeight(sum / (end - start) / 100);
  });
}

/** Stable seeded bars shown when a message has no real waveform data. */
export function placeholderWaveform(seed: number): number[] {
  const raw = Array.from({ length: BAR_COUNT }, (_, i) => {
    const x = Math.sin(seed * 9301 + i * 49297) * 233280;
    return Math.abs(x - Math.floor(x));
  });

  // smooth neighbours so the bars read like a real speech envelope,
  // then let quieter moments sit low instead of every bar being tall.
  return raw.map((level, i) => {
    const previous = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(raw.length - 1, i + 1)];
    const smoothed = (previous + level * 2 + next) / 4;
    return toHeight(Math.pow(smoothed, 1.4));
  });
}

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

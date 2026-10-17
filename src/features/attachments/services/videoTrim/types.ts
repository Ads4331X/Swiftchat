import type { ReactNode } from "react";

/**
 * Result passed back to the caller: the trimmed media uri, or `null` when the
 * user dismissed the editor without trimming anything.
 */
export type VideoTrimmerResult = string | null;

export type UseVideoTrimmerOptions = {
  /** Uri of the media that should be trimmed. */
  uri?: string;
  /** Longest clip the user is allowed to keep, in milliseconds. */
  maxDurationMs: number;
  /** Called when trimming finishes or the editor is dismissed. */
  onResult: (result: VideoTrimmerResult) => void;
};

export type UseVideoTrimmerResult = {
  /** Opens the platform trimmer for the current uri. */
  openTrimmer: () => void;
  /** Extra UI the platform needs rendered inside the screen (null on native). */
  trimmer: ReactNode;
};

export type UseVideoTrimmer = (
  options: UseVideoTrimmerOptions,
) => UseVideoTrimmerResult;

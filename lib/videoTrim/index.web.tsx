import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "@/constants/theme-provider";
import type {
  UseVideoTrimmer,
  VideoTrimmerResult,
} from "./types";

const FFMPEG_VERSION = "0.12.15";
const CORE_VERSION = "0.12.10";
const FFMPEG_ESM_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm`;
const CORE_ESM_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpegPromise: Promise<FFmpeg> | null = null;
let workerUrl: string | null = null;
let previousOutputUrl: string | null = null;

/**
 * The published worker relies on relative imports (`./const.js`) which a Blob
 * URL cannot resolve, so its three small modules are fetched once and inlined
 * into a single self-contained module worker.
 */
async function createWorkerSource(): Promise<string> {
  const files = ["const.js", "errors.js", "worker.js"];
  const sources = await Promise.all(
    files.map(async (file) => {
      const response = await fetch(`${FFMPEG_ESM_BASE}/${file}`);
      if (!response.ok) {
        throw new Error(`Could not download ${file} (${response.status})`);
      }
      return response.text();
    }),
  );

  const inline = (source: string) =>
    source
      .replace(/^\s*import\s+[^\n]*from\s+"\.\/[^"]+";\s*$/gm, "")
      .replace(/^\s*export\s+/gm, "");

  const worker = sources.map(inline).join("\n");
  if (worker.includes('from "./')) {
    throw new Error("Could not inline the FFmpeg worker");
  }
  return worker;
}

function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      if (!workerUrl) {
        workerUrl = URL.createObjectURL(
          new Blob([await createWorkerSource()], {
            type: "text/javascript",
          }),
        );
      }

      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        classWorkerURL: workerUrl,
        // The worker runs as a module worker, so the core is the ESM build
        // (it is imported dynamically and exposes a default export).
        coreURL: await toBlobURL(
          `${CORE_ESM_BASE}/ffmpeg-core.js`,
          "text/javascript",
        ),
        wasmURL: await toBlobURL(
          `${CORE_ESM_BASE}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });
      return ffmpeg;
    })();

    ffmpegPromise = ffmpegPromise.catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }

  return ffmpegPromise;
}

function detectContainer(bytes: Uint8Array): "mp4" | "webm" | "mkv" {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));

  if (ascii(4, 8) === "ftyp") return "mp4";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBM") return "webm";
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "mkv";
  }
  return "mp4";
}

async function trimVideo(
  uri: string,
  startSec: number,
  endSec: number,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const ffmpeg = await getFFmpeg();
  const input = await fetchFile(uri);
  const container = detectContainer(input);
  const inputName = `input.${container}`;
  const outputName = `output.${container}`;

  const handleProgress = ({ progress }: { progress: number; time: number }) =>
    onProgress(Math.min(Math.max(progress, 0), 1));
  ffmpeg.on("progress", handleProgress);

  try {
    await ffmpeg.writeFile(inputName, input);
    await ffmpeg.exec([
      "-ss",
      String(startSec),
      "-i",
      inputName,
      "-t",
      String(endSec - startSec),
      "-c",
      "copy",
      outputName,
    ]);
    const output = await ffmpeg.readFile(outputName);
    if (typeof output === "string") {
      throw new Error("ffmpeg did not return video data");
    }

    // zero-copy view over exactly the bytes that were read
    const bytes = new Uint8Array(
      output.buffer as ArrayBuffer,
      output.byteOffset,
      output.byteLength,
    );
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: `video/${container === "mkv" ? "x-matroska" : container}`,
      }),
    );
    const stale = previousOutputUrl;
    previousOutputUrl = url;
    if (stale) {
      setTimeout(() => URL.revokeObjectURL(stale), 0);
    }
    return url;
  } finally {
    ffmpeg.off("progress", handleProgress);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

function readDuration(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Could not read video metadata"));
    video.src = uri;
  });
}

type TrimPanelProps = {
  uri: string;
  maxDurationMs: number;
  onResult: (result: VideoTrimmerResult) => void;
};

function TrimPanel({ uri, maxDurationMs, onResult }: TrimPanelProps) {
  const { colors } = useTheme();
  const maxSeconds = maxDurationMs / 1000;

  const [duration, setDuration] = useState<number | null>(null);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;

    readDuration(uri)
      .then((value) => {
        if (cancelled) return;
        setDuration(value);
        setEnd(String(Math.min(value, maxSeconds)));
      })
      .catch(() => {
        if (cancelled) return;
        setEnd(String(maxSeconds));
      });

    return () => {
      cancelled = true;
    };
  }, [uri, maxSeconds]);

  const startSec = Number.parseFloat(start);
  const endSec = Number.parseFloat(end);

  const handleTrim = async () => {
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      setError("Enter a start and an end time.");
      return;
    }
    if (startSec < 0 || endSec <= startSec) {
      setError("The end time must be after the start time.");
      return;
    }
    if (endSec - startSec > maxSeconds + 0.05) {
      setError(`The clip can be at most ${maxSeconds} seconds long.`);
      return;
    }
    if (duration != null && endSec > duration + 0.05) {
      setError(`The video is only ${duration.toFixed(1)} seconds long.`);
      return;
    }

    setError(null);
    setBusy(true);
    setProgress(0);

    try {
      onResult(await trimVideo(uri, startSec, endSec, setProgress));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (!busy) onResult(null);
        }}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: colors.background, borderColor: colors.icon },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>
          Trim video
        </Text>
        <Text style={[styles.hint, { color: colors.icon }]}>
          {duration != null
            ? `Video length: ${duration.toFixed(1)}s · up to ${maxSeconds}s allowed`
            : `Up to ${maxSeconds}s allowed`}
        </Text>

        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.icon }]}>
              Start (s)
            </Text>
            <TextInput
              value={start}
              onChangeText={setStart}
              editable={!busy}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.icon },
              ]}
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.icon }]}>
              End (s)
            </Text>
            <TextInput
              value={end}
              onChangeText={setEnd}
              editable={!busy}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.icon },
              ]}
            />
          </View>
        </View>

        {error && (
          <Text style={[styles.error, { color: "#DC2626" }]}>{error}</Text>
        )}

        {busy && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.hint, { color: colors.text }]}>
              Trimming… {Math.round(progress * 100)}%
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            disabled={busy}
            onPress={() => onResult(null)}
            style={[styles.button, busy && styles.disabled]}
          >
            <Text style={[styles.buttonText, { color: colors.icon }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={handleTrim}
            style={[
              styles.button,
              styles.primaryButton,
              { backgroundColor: colors.tint },
              busy && styles.disabled,
            ]}
          >
            <Text
              style={[styles.buttonText, { color: colors.background }]}
            >
              Trim
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const useVideoTrimmer: UseVideoTrimmer = ({
  uri,
  maxDurationMs,
  onResult,
}) => {
  const [open, setOpen] = useState(false);

  const handleResult = (result: VideoTrimmerResult) => {
    setOpen(false);
    onResult(result);
  };

  return {
    openTrimmer: () => {
      if (uri) setOpen(true);
    },
    trimmer: open && uri ? (
      <TrimPanel
        uri={uri}
        maxDurationMs={maxDurationMs}
        onResult={handleResult}
      />
    ) : null,
  };
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: {
    fontSize: 13,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  primaryButton: {
    minWidth: 72,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});

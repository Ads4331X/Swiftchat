import { useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";
import type {
  AttachmentMeta,
  AttachmentStatus,
} from "@/features/attachments/components/attachment/types";
import {
  MEDIA_WIDTH,
  formatDuration,
  formatFileSize,
  percent,
  placeholderWaveform,
  resolveWaveform,
} from "@/features/attachments/components/attachment/utils";
import { CircularControl } from "@/features/attachments/components/attachment/CircularControl";
import { useVoicePlayer } from "../../hooks/useVoicePlayer";

const BAR_AREA_HEIGHT = 30;

export function VoiceAttachment({
  attachment,
  status,
  progress,
  isMine,
  timeText,
  sourceUri,
  seed = 0,
  onDownload,
}: {
  attachment: AttachmentMeta;
  status: AttachmentStatus;
  progress: number;
  sourceUri: string | null;
  isMine?: boolean;
  timeText?: string;
  seed?: number;
  onDownload?: () => void;
  onOpen?: () => void;
}) {
  const { attachmentColors } = useTheme();
  const colors = attachmentColors(!!isMine);
  const {
    play,
    pause,
    seekTo,
    status: playbackStatus,
  } = useVoicePlayer({
    uri: sourceUri ?? "",
  });

  const isReady = status === "ready";
  const isBusy = status === "downloading" || status === "processing";
  const hasWaveform = Boolean(attachment.waveform?.length);

  // Keep the seeded fallback stable while loading and after playback is ready.
  const bars = useMemo(() => {
    if (hasWaveform) return resolveWaveform(attachment.waveform, seed);
    return placeholderWaveform(seed);
  }, [attachment.waveform, seed, hasWaveform]);

  // Web reports NaN before metadata loads and can report Infinity; native reports 0
  // before load. Only trust a finite positive duration and fall back to metadata.
  const playerDuration = playbackStatus.duration;
  const safePlayerDuration =
    Number.isFinite(playerDuration) && playerDuration > 0 ? playerDuration : 0;
  const totalSeconds =
    safePlayerDuration || (attachment.durationMs ?? 0) / 1000;
  const currentSeconds = Number.isFinite(playbackStatus.currentTime)
    ? playbackStatus.currentTime
    : 0;

  // Local scrub position: while the finger is on the waveform, the bars and
  // time follow it immediately instead of waiting for player status ticks.
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);
  const isScrubbing = scrubSeconds !== null;
  const effectiveSeconds = scrubSeconds ?? currentSeconds;

  const canShowProgress =
    isReady &&
    Number.isFinite(totalSeconds) &&
    totalSeconds > 0 &&
    Number.isFinite(effectiveSeconds) &&
    (isScrubbing || playbackStatus.isLoaded);

  const playedFraction = canShowProgress
    ? Math.max(0, Math.min(1, effectiveSeconds / totalSeconds))
    : 0;

  // playback fill while ready, download progress while fetching.
  const filled = canShowProgress
    ? playedFraction
    : isBusy
      ? Math.max(0, Math.min(1, progress))
      : 0;

  // elapsed while playing / scrubbed, total duration otherwise.
  const showElapsed =
    canShowProgress &&
    (isScrubbing || playbackStatus.playing || currentSeconds > 0);
  const displayMs = showElapsed
    ? effectiveSeconds * 1000
    : totalSeconds > 0
      ? totalSeconds * 1000
      : (attachment.durationMs ?? 0);
  const timeLabel = isReady
    ? showElapsed
      ? // While playing or scrubbing never fall back to the message
        // timestamp: formatDuration(0) returns "" and would flash timeText.
        formatDuration(Math.round(displayMs)) || "0:00"
      : formatDuration(Math.round(displayMs)) || timeText || ""
    : isBusy
      ? `${percent(progress)}%`
      : formatFileSize(attachment.fileSize) || timeText || "";

  const trackRef = useRef(0);
  const lastSeekRef = useRef(0);

  const timeAtLocation = (locationX: number): number | null => {
    if (
      !isReady ||
      !Number.isFinite(locationX) ||
      !Number.isFinite(totalSeconds) ||
      totalSeconds <= 0 ||
      !Number.isFinite(trackRef.current) ||
      trackRef.current <= 0
    ) {
      return null;
    }
    const fraction = Math.max(0, Math.min(1, locationX / trackRef.current));
    return fraction * totalSeconds;
  };

  const beginScrub = (locationX: number) => {
    const target = timeAtLocation(locationX);
    if (target == null) return;
    setScrubSeconds(target);
    lastSeekRef.current = target;
    seekTo(target);
  };

  const moveScrub = (locationX: number) => {
    const target = timeAtLocation(locationX);
    if (target == null) return;
    setScrubSeconds(target);
    // Throttle player seeks during fast drags; the bar still follows the finger.
    if (Math.abs(target - lastSeekRef.current) >= 0.05) {
      lastSeekRef.current = target;
      seekTo(target);
    }
  };

  const endScrub = () => {
    setScrubSeconds(null);
  };

  const controlBg = isReady
    ? isMine
      ? "rgba(255,255,255,0.95)"
      : colors.accent
    : colors.placeholderBg;
  const controlIcon = isReady
    ? isMine
      ? colors.accent
      : "#FFFFFF"
    : colors.iconMuted;

  return (
    <View
      className="flex-row items-center gap-3 rounded-[18px] pl-2 pr-3 py-2"
      style={{ width: MEDIA_WIDTH, backgroundColor: colors.cardColor }}
    >
      <CircularControl
        size={38}
        showShadow={false}
        backgroundColor={controlBg}
        accessibilityLabel={
          isReady && playbackStatus.playing
            ? "Pause voice message"
            : isReady
              ? "Play voice message"
              : "Download voice message"
        }
        onPress={() => {
          if (!isReady || !sourceUri) {
            onDownload?.();
            return;
          }
          if (playbackStatus.playing) pause();
          else play();
        }}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.iconMuted} />
        ) : (
          <Feather
            name={
              isReady && playbackStatus.playing
                ? "pause"
                : isReady
                  ? "play"
                  : "download"
            }
            size={16}
            color={controlIcon}
            style={
              isReady && !playbackStatus.playing ? { marginLeft: 2 } : undefined
            }
          />
        )}
      </CircularControl>

      <View
        className="flex-1 justify-center"
        style={{ height: BAR_AREA_HEIGHT }}
        pointerEvents={isReady ? "box-only" : "none"}
        onLayout={(event) => {
          trackRef.current = event.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => isReady}
        onMoveShouldSetResponder={() => isReady}
        onResponderGrant={(event) => beginScrub(event.nativeEvent.locationX)}
        onResponderMove={(event) => moveScrub(event.nativeEvent.locationX)}
        onResponderRelease={endScrub}
        onResponderTerminate={endScrub}
      >
        <View
          className="flex-row items-center"
          style={{ height: BAR_AREA_HEIGHT, gap: 2 }}
        >
          {bars.map((height, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height,
                borderRadius: 2,
                backgroundColor:
                  (index + 0.5) / bars.length <= filled
                    ? colors.accent
                    : colors.trackColor,
              }}
            />
          ))}
        </View>
      </View>

      <Text
        allowFontScaling={false}
        numberOfLines={1}
        className="text-[12px] font-medium"
        style={{
          color: colors.subtle,
          fontVariant: ["tabular-nums"],
          width: 44,
          textAlign: "right",
        }}
      >
        {timeLabel}
      </Text>
    </View>
  );
}

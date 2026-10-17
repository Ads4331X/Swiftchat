import { useMemo, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
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
  const { play, pause, seekTo, status: playbackStatus } = useVoicePlayer({
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

  const totalSeconds =
    playbackStatus.duration || (attachment.durationMs ?? 0) / 1000;
  const currentSeconds = playbackStatus.currentTime ?? 0;
  const hasPlaybackTime =
    isReady &&
    playbackStatus.isLoaded &&
    Number.isFinite(currentSeconds) &&
    Number.isFinite(totalSeconds) &&
    totalSeconds > 0;
  const playedFraction =
    hasPlaybackTime
      ? Math.max(0, Math.min(1, currentSeconds / totalSeconds))
      : 0;

  // playback fill while ready, download progress while fetching.
  const filled = hasPlaybackTime
    ? playedFraction
    : isBusy
      ? Math.max(0, Math.min(1, progress))
      : 0;

  // elapsed while playing / scrubbed, total duration otherwise.
  const displayMs =
    hasPlaybackTime && (playbackStatus.playing || currentSeconds > 0)
      ? currentSeconds * 1000
      : totalSeconds > 0
        ? totalSeconds * 1000
        : (attachment.durationMs ?? 0);
  const timeLabel = isReady
    ? formatDuration(Math.round(displayMs)) || timeText || ""
    : isBusy
      ? `${percent(progress)}%`
      : formatFileSize(attachment.fileSize) || timeText || "";

  const trackRef = useRef(0);

  const handleSeek = (locationX: number) => {
    if (!isReady || totalSeconds <= 0 || trackRef.current <= 0) return;
    const fraction = Math.max(0, Math.min(1, locationX / trackRef.current));
    seekTo(fraction * totalSeconds);
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
            style={isReady && !playbackStatus.playing ? { marginLeft: 2 } : undefined}
          />
        )}
      </CircularControl>

      <Pressable
        className="flex-1 justify-center"
        style={{ height: BAR_AREA_HEIGHT }}
        disabled={!isReady}
        onLayout={(event) => {
          trackRef.current = event.nativeEvent.layout.width;
        }}
        onPress={(event) => handleSeek(event.nativeEvent.locationX)}
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
      </Pressable>

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

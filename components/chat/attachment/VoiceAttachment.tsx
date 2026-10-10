import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";
import { useTheme } from "@/constants/theme-provider";
import type { AttachmentMeta, AttachmentStatus } from "./types";
import { MEDIA_WIDTH, WAVEFORM, formatDuration, formatFileSize, statusSubtitle } from "./utils";
import { CircularControl } from "./CircularControl";

export function VoiceAttachment({
  attachment,
  status,
  progress,
  isMine,
  timeText,
  onDownload,
  onOpen,
}: {
  attachment: AttachmentMeta;
  status: AttachmentStatus;
  progress: number;
  isMine?: boolean;
  timeText?: string;
  onDownload?: () => void;
  onOpen?: () => void;
}) {
  const { attachmentColors } = useTheme();
  const colors = attachmentColors(!!isMine);

  const isReady = status === "ready";
  const isBusy = status === "downloading" || status === "processing";
  const filled = isBusy || isReady ? Math.max(0, Math.min(1, progress)) : 0;

  const duration = formatDuration(attachment.durationMs);
  const readyText = duration || formatFileSize(attachment.fileSize) || timeText || "Voice message";

  return (
    <View
      className="flex-row items-center gap-2.5 rounded-[14px] px-2.5 py-2"
      style={{ width: MEDIA_WIDTH, backgroundColor: colors.cardColor }}
    >
      <CircularControl
        size={40}
        accessibilityLabel={isReady ? "Play voice message" : "Download voice message"}
        onPress={isReady ? onOpen : onDownload}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Feather
            name={isReady ? "play" : "download"}
            size={17}
            color={colors.accent}
            style={isReady ? { marginLeft: 2 } : undefined}
          />
        )}
      </CircularControl>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-0.5" style={{ height: 26 }}>
          {WAVEFORM.map((h, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: h,
                borderRadius: 2,
                backgroundColor:
                  index / WAVEFORM.length <= filled ? colors.accent : colors.trackColor,
              }}
            />
          ))}
        </View>

        <View className="mt-1.5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            <Feather name="mic" size={11} color={colors.subtle} />
            <Text className="text-[11px] font-medium" style={{ color: colors.subtle }}>
              {statusSubtitle(status, progress, "Voice message")}
            </Text>
          </View>
          <Text className="text-[11px]" style={{ color: colors.subtle }}>
            {readyText}
          </Text>
        </View>
      </View>
    </View>
  );
}

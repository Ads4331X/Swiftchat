import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useTheme } from "@/shared/providers/theme-provider";
import type { AttachmentMeta, AttachmentStatus } from "@/features/attachments/components/attachment/types";
import { MEDIA_WIDTH, documentVisual, formatFileSize, statusSubtitle } from "@/features/attachments/components/attachment/utils";

export function DocumentAttachment({
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

  const { icon, color } = documentVisual(attachment.mimeType, attachment.fileName);

  const isReady = status === "ready";
  const isBusy = status === "downloading" || status === "processing";

  const subtitle = statusSubtitle(
    status,
    progress,
    [formatFileSize(attachment.fileSize), timeText].filter(Boolean).join(" · "),
  );

  return (
    <View
      className="flex-row items-center gap-2.5 rounded-[14px] p-2.5"
      style={{ width: MEDIA_WIDTH, backgroundColor: colors.cardColor }}
    >
      <View
        className="items-center justify-center rounded-[10px]"
        style={{ width: 42, height: 42, backgroundColor: `${color}22` }}
      >
        <Feather name={icon} size={20} color={color} />
      </View>

      <View className="min-w-0 flex-1">
        <Text className="text-[13.5px] font-semibold" numberOfLines={1} ellipsizeMode="middle" style={{ color: colors.textColor }}>
          {attachment.fileName ?? "Document"}
        </Text>
        <Text className="mt-0.5 text-[11.5px]" numberOfLines={1} style={{ color: colors.subtle }}>
          {subtitle}
        </Text>
      </View>

      <Pressable
        onPress={isReady ? onOpen : onDownload}
        accessibilityRole="button"
        accessibilityLabel={isReady ? "Open document" : "Download document"}
        hitSlop={8}
        className="items-center justify-center"
        style={{ width: 34, height: 34 }}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Feather
            name={isReady ? "chevron-right" : status === "error" ? "refresh-cw" : "download"}
            size={19}
            color={status === "error" ? "#E5484D" : colors.accent}
          />
        )}
      </Pressable>
    </View>
  );
}

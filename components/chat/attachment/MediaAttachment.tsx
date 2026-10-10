import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/constants/theme-provider";
import type { AttachmentMeta, AttachmentStatus } from "./types";
import {
  MEDIA_WIDTH,
  clampMediaHeight,
  formatDuration,
  formatFileSize,
  resolveAspect,
} from "./utils";
import { StatusOverlay, PlayOverlay } from "./StatusOverlay";
import { AttachmentFooter } from "./AttachmentFooter";

export function MediaAttachment({
  attachment,
  kind,
  status,
  progress,
  sourceUri,
  thumbnailUri,
  isMine,
  timeText,
  isFavorite,
  onDownload,
  onOpen,
  onToggleFavorite,
}: {
  attachment: AttachmentMeta;
  kind: "image" | "video";
  status: AttachmentStatus;
  progress: number;
  sourceUri?: string | null;
  thumbnailUri?: string | null;
  isMine?: boolean;
  timeText?: string;
  isFavorite?: boolean;
  onDownload?: () => void;
  onOpen?: () => void;
  onToggleFavorite?: () => void;
}) {
  const { attachmentColors } = useTheme();
  const colors = attachmentColors(!!isMine);

  const aspect = resolveAspect(attachment.width, attachment.height, kind === "video" ? 16 / 9 : 4 / 3);
  const height = clampMediaHeight(MEDIA_WIDTH, aspect);

  const visualUri = kind === "image" ? sourceUri : (thumbnailUri ?? sourceUri);
  const showVisual = status === "ready" && !!visualUri;

  const size = formatFileSize(attachment.fileSize);
  const duration = formatDuration(attachment.durationMs);
  const typeLabel = kind === "video" ? "Video" : "Photo";

  return (
    <View
      className="overflow-hidden rounded-[14px]"
      style={{ width: MEDIA_WIDTH, backgroundColor: colors.cardColor }}
    >
      <Pressable
        onPress={showVisual ? onOpen : onDownload}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel} attachment`}
        style={{ width: MEDIA_WIDTH, height, backgroundColor: colors.placeholderBg }}
      >
        {showVisual ? (
          <Image source={{ uri: visualUri as string }} contentFit="cover" transition={180} className="h-full w-full" />
        ) : (
          <View className="absolute inset-0 items-center justify-center">
            <Feather
              name={kind === "video" ? "video" : "image"}
              size={46}
              color={colors.iconMuted}
              style={{ opacity: 0.35 }}
            />
          </View>
        )}

        {status === "ready" && kind === "video" ? (
          <View className="absolute inset-0 items-center justify-center">
            <PlayOverlay onPress={onOpen} />
          </View>
        ) : status !== "ready" ? (
          <View className="absolute inset-0 items-center justify-center">
            <StatusOverlay
              status={status}
              progress={progress}
              action={onDownload}
              iconMuted={colors.iconMuted}
            />
          </View>
        ) : null}

        {kind === "video" && duration ? (
          <View
            className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-md px-1.5 py-0.5"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          >
            <Feather name="play" size={10} color="#fff" />
            <Text className="text-[11px] font-semibold text-white">{duration}</Text>
          </View>
        ) : null}
      </Pressable>

      <AttachmentFooter
        colors={colors}
        left={[size, typeLabel].filter(Boolean).join(" · ")}
        timeText={timeText}
        showFavorite={status === "ready" && kind === "image"}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
      />
    </View>
  );
}
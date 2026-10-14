import { useState } from "react";
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
import { MediaViewer } from "./MediaViewer";

export function MediaAttachment({
  attachment,
  kind,
  status,
  progress,
  sourceUri,
  thumbnailUri,
  isMine,
  timeText,
  onDownload,
  onOpen,
}: {
  attachment: AttachmentMeta;
  kind: "image" | "video";
  status: AttachmentStatus;
  progress: number;
  sourceUri?: string | null;
  thumbnailUri?: string | null;
  isMine?: boolean;
  timeText?: string;
  onDownload?: () => void;
  onOpen?: () => void;
}) {
  const { attachmentColors } = useTheme();
  const colors = attachmentColors(!!isMine);

  const [viewerOpen, setViewerOpen] = useState(false);

  const aspect = resolveAspect(attachment.width, attachment.height, kind === "video" ? 16 / 9 : 4 / 3);
  const height = clampMediaHeight(MEDIA_WIDTH, aspect);

  const visualUri = kind === "image" ? sourceUri : (thumbnailUri ?? sourceUri);
  const showVisual = status === "ready" && !!visualUri;

  const size = formatFileSize(attachment.fileSize);
  const duration = formatDuration(attachment.durationMs);
  const typeLabel = kind === "video" ? "Video" : "Photo";

  const handlePress = () => {
    if (!showVisual) {
      onDownload?.();
      return;
    }
    if (kind === "image") {
      setViewerOpen(true);
      return;
    }
    onOpen?.();
  };

  return (
    <View
      className="overflow-hidden rounded-[14px]"
      style={{ width: MEDIA_WIDTH, backgroundColor: colors.cardColor }}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel} attachment`}
        style={{ width: MEDIA_WIDTH, height, backgroundColor: colors.placeholderBg }}
      >
        {showVisual ? (
          <Image
            source={{ uri: visualUri as string }}
            contentFit="cover"
            transition={180}
            style={{ width: "100%", height: "100%" }}
          />
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
          <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5">
            <Feather name="play" size={10} color="#fff" />
            <Text className="text-[11px] font-semibold text-white">{duration}</Text>
          </View>
        ) : null}

        {showVisual ? (
          <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5">
            <Feather name="info" size={10} color="#fff" />
            <Text className="text-[11px] font-semibold text-white" numberOfLines={1}>
              {[size, typeLabel, timeText].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {kind === "image" ? (
        <MediaViewer
          visible={viewerOpen}
          uri={visualUri}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </View>
  );
}
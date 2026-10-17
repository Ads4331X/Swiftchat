import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Text, View } from "react-native";
import type { AttachmentStatus } from "@/features/attachments/components/attachment/types";
import { percent } from "@/features/attachments/components/attachment/utils";
import { CircularControl } from "@/features/attachments/components/attachment/CircularControl";

export function StatusOverlay({
  status,
  progress,
  action,
  iconMuted,
}: {
  status: AttachmentStatus;
  progress: number;
  action?: () => void;
  iconMuted: string;
}) {
  if (status === "ready") return null;

  if (status === "downloading" || status === "processing") {
    const processing = status === "processing";
    return (
      <View className="items-center justify-center gap-2.5" style={{ width: "80%" }}>
        <View
          className="items-center justify-center"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          {processing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-sm font-bold text-white">{percent(progress)}%</Text>
          )}
        </View>
        <Text className="text-xs font-semibold text-white" numberOfLines={1}>
          {processing ? "Decrypting…" : `Downloading… ${percent(progress)}%`}
        </Text>
        <View
          className="w-full overflow-hidden rounded-[2px]"
          style={{ height: 4, backgroundColor: "rgba(255,255,255,0.28)" }}
        >
          <View
            style={{
              width: processing ? "100%" : `${percent(progress)}%`,
              height: "100%",
              borderRadius: 2,
              backgroundColor: "#fff",
            }}
          />
        </View>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View className="items-center justify-center gap-2">
        <CircularControl accessibilityLabel="Retry download" onPress={action}>
          <Feather name="refresh-cw" size={22} color="#E5484D" />
        </CircularControl>
        <Text className="text-xs font-semibold" style={{ color: iconMuted }}>
          Download failed · Tap to retry
        </Text>
      </View>
    );
  }

  return (
    <View className="items-center justify-center gap-2">
      <CircularControl accessibilityLabel="Download attachment" onPress={action}>
        <Feather name="download" size={22} color="#29A195" />
      </CircularControl>
      <Text className="text-xs font-semibold" style={{ color: iconMuted }}>
        Tap to download
      </Text>
    </View>
  );
}

export function PlayOverlay({ onPress }: { onPress?: () => void }) {
  return (
    <CircularControl
      accessibilityLabel="Play video"
      onPress={onPress}
      tone="dark"
      size={54}
    >
      <Feather name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
    </CircularControl>
  );
}
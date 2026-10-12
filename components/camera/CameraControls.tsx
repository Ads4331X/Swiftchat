import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  addListener,
  getAssetInfoAsync,
  getAssetsAsync,
  requestPermissionsAsync,
  SortBy,
} from "expo-media-library";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CameraLensOption } from "./useCameraLenses";
import { launchGallery } from "@/lib/Attachments";

const zoomLabel = (value: number) => `${value}x`;

type CameraControlsProps = {
  mode: "picture" | "video";
  flashSetting: "off" | "on";
  isVideoLightOn: boolean;
  isFlashDisabled: boolean;
  isRecording: boolean;
  recordingTime: number;
  zoomOptions: CameraLensOption[];
  /** Optional: currently selected zoom value, used to highlight a pill. */
  activeZoom?: number;
  /** Optional: extra space under the controls if the bottom is clipped. */
  bottomOffset?: number;
  onZoomChange: (option: CameraLensOption) => void;
  onModeChange: (mode: "picture" | "video") => void;
  onToggleFlash: () => void;
  onToggleFacing: () => void;
  onCancel: () => void;
  onShutter: () => void;
  latestAssestUri: string | null;
};

/** Loads the newest photo/video so the gallery thumbnail always renders. */
function useLatestAsset() {
  const [uri, setUri] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const perm = await requestPermissionsAsync(false, ["photo", "video"]);
      if (!perm.granted) return;

      const { assets } = await getAssetsAsync({
        first: 1,
        mediaType: ["photo", "video"],
        sortBy: [[SortBy.creationTime, false]],
      });

      if (!assets.length) {
        setUri(null);
        return;
      }

      const info = await getAssetInfoAsync(assets[0]);
      setUri(info.localUri ?? assets[0].uri);
    } catch {
      // keep the previous thumbnail
    }
  }, []);

  useEffect(() => {
    refresh();
    const sub = addListener(() => {
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { uri, refresh };
}

/** Blinking red dot shown while recording. */
function RecordingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={{ opacity }}
      className="mr-2 h-2.5 w-2.5 rounded-full bg-red-500"
    />
  );
}

/** Round translucent icon button for the top bar. */
function RoundButton({
  icon,
  onPress,
  label,
  disabled,
  iconSize = 26,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  label: string;
  disabled?: boolean;
  iconSize?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="h-12 w-12 items-center justify-center rounded-full bg-black/45"
      style={({ pressed }) => ({
        opacity: disabled ? 0.3 : pressed ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Ionicons name={icon} size={iconSize} color="#fff" />
    </Pressable>
  );
}

export function CameraControls({
  mode,
  flashSetting,
  isVideoLightOn,
  isFlashDisabled,
  isRecording,
  recordingTime,
  zoomOptions,
  activeZoom,
  bottomOffset = 0,
  onZoomChange,
  onModeChange,
  onToggleFlash,
  onToggleFacing,
  onCancel,
  onShutter,
  latestAssestUri,
}: CameraControlsProps) {
  const insets = useSafeAreaInsets();
  const { uri: libraryUri, refresh } = useLatestAsset();
  const [thumbFailed, setThumbFailed] = useState(false);

  // Prefer the freshly loaded library asset, fall back to the prop.
  const thumbUri = thumbFailed ? null : (libraryUri ?? latestAssestUri ?? null);

  useEffect(() => {
    setThumbFailed(false);
  }, [libraryUri, latestAssestUri]);

  // Refresh the thumbnail when a recording ends.
  const wasRecording = useRef(isRecording);
  useEffect(() => {
    if (wasRecording.current && !isRecording) {
      wasRecording.current = isRecording;
      const t = setTimeout(refresh, 800);
      return () => clearTimeout(t);
    }
    wasRecording.current = isRecording;
  }, [isRecording, refresh]);

  const handleShutter = () => {
    onShutter();
    if (mode === "picture") setTimeout(refresh, 1000);
  };

  const handleGallery = async () => {
    try {
      await launchGallery();
    } finally {
      refresh();
    }
  };

  const minutes = Math.floor(recordingTime / 60);
  const seconds = recordingTime % 60;
  const recordingTimeText = `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;

  const flashIcon =
    mode === "video"
      ? isVideoLightOn
        ? "flashlight"
        : "flashlight-outline"
      : flashSetting === "off"
        ? "flash-off-outline"
        : "flash";

  const flashLabel =
    mode === "video"
      ? isVideoLightOn
        ? "Turn torch off"
        : "Turn torch on"
      : flashSetting === "off"
        ? "Turn flash on"
        : "Turn flash off";

  const shutterLabel =
    mode === "picture"
      ? "Take photo"
      : isRecording
        ? "Stop recording"
        : "Start recording";

  return (
    <>
      {/* Recording indicator */}
      {isRecording && (
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 z-10 items-center"
          style={{ top: insets.top + 12 }}
        >
          <View className="flex-row items-center rounded-full bg-black/60 px-4 py-2">
            <RecordingDot />
            <Text
              className="text-sm font-semibold text-white"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              REC {recordingTimeText}
            </Text>
          </View>
        </View>
      )}

      {/* Top overlay: close on the left, flash + flip on the right */}
      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: 40,
        }}
      >
        <RoundButton
          icon="close"
          iconSize={28}
          label="Close camera"
          onPress={onCancel}
        />

        <View className="flex-row gap-4">
          <RoundButton
            icon={flashIcon}
            label={flashLabel}
            onPress={onToggleFlash}
            disabled={isFlashDisabled}
          />
          <RoundButton
            icon="camera-reverse-outline"
            label="Switch camera"
            onPress={onToggleFacing}
            disabled={isRecording}
          />
        </View>
      </LinearGradient>

      {/* Bottom controls */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.2)"]}
        pointerEvents="box-none"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: "center",
          paddingTop: 56,
          paddingBottom: insets.bottom + 28 + bottomOffset,
        }}
      >
        {/* Zoom pills (hidden while recording) */}
        {!isRecording && (
          <View className="mb-6 flex-row items-center gap-2">
            {zoomOptions.map((option) => {
              const isActive = activeZoom === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => onZoomChange(option)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Zoom ${zoomLabel(option.value)}`}
                  accessibilityState={{ selected: isActive }}
                  className={`h-11 min-w-[52px] items-center justify-center rounded-full px-3.5 ${
                    isActive ? "bg-white" : "bg-black/20"
                  }`}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    className={`text-sm font-bold ${
                      isActive ? "text-black" : "text-white"
                    }`}
                  >
                    {zoomLabel(option.value)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Photo / Video switch (hidden while recording) */}
        {!isRecording && (
          <View className="mb-7 flex-row gap-1.5 rounded-full bg-black/45 p-1.5">
            {(["picture", "video"] as const).map((m) => {
              const selected = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => onModeChange(m)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    m === "picture" ? "Photo mode" : "Video mode"
                  }
                  accessibilityState={{ selected }}
                  className={`rounded-full px-7 py-2.5 ${
                    selected ? "bg-white" : ""
                  }`}
                >
                  <Text
                    className={`text-sm font-bold tracking-wider ${
                      selected ? "text-black" : "text-white"
                    }`}
                  >
                    {m === "picture" ? "PHOTO" : "VIDEO"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {/* Thumbnail | shutter | spacer */}
        <View className="w-full flex-row items-center justify-between px-10">
          {/* Gallery thumbnail */}
          <Pressable
            onPress={handleGallery}
            disabled={isRecording}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open gallery"
            className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white/90 bg-white/15"
            style={({ pressed }) => ({
              opacity: isRecording ? 0.3 : pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            {thumbUri ? (
              <Image
                key={thumbUri}
                source={{ uri: thumbUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <View className="flex-1 items-center justify-center">
                <Ionicons name="images-outline" size={26} color="#fff" />
              </View>
            )}
          </Pressable>

          {/* Shutter */}
          <Pressable
            onPress={handleShutter}
            accessibilityRole="button"
            accessibilityLabel={shutterLabel}
            className="h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-white"
            style={({ pressed }) => ({
              transform: [{ scale: pressed ? 0.93 : 1 }],
            })}
          >
            <View
              className={
                isRecording
                  ? "h-9 w-9 rounded-lg bg-red-500"
                  : mode === "video"
                    ? "h-[66px] w-[66px] rounded-full bg-red-500"
                    : "h-[66px] w-[66px] rounded-full bg-white"
              }
            />
          </Pressable>

          {/* Spacer keeps the shutter centered */}
          <View className="h-14 w-14" />
        </View>
      </LinearGradient>
    </>
  );
}

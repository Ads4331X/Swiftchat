import { Feather } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, View } from "react-native";
import Video from "react-native-video";

type ReviewPreviewProps = {
  uri?: string;
  isVideo: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
};

export function ReviewPreview({
  uri,
  isVideo,
  isPlaying,
  onTogglePlay,
}: ReviewPreviewProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
      }}
    >
      {uri ? (
        isVideo ? (
          <View style={{ width: "100%", height: "100%" }}>
            <Video
              key={uri} // remount when the source changes after trimming
              source={{ uri }}
              style={{ width: "100%", height: "100%", borderRadius: 16 }}
              resizeMode="contain"
              repeat
              paused={!isPlaying}
              playInBackground={false}
              playWhenInactive={false}
            />
            {/* Tap anywhere to play / pause */}
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { alignItems: "center", justifyContent: "center" },
              ]}
              onPress={onTogglePlay}
            >
              {!isPlaying && (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(0,0,0,0.5)",
                  }}
                >
                  <Feather name="play" size={30} color="white" />
                </View>
              )}
            </Pressable>
          </View>
        ) : (
          <Image
            source={{ uri }}
            resizeMode="contain"
            style={{ width: "100%", height: "100%", borderRadius: 16 }}
          />
        )
      ) : null}
    </View>
  );
}

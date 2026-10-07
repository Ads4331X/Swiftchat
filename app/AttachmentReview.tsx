import { useTheme } from "@/constants/theme-provider";
import { encryptImage } from "@/lib/crypto";
import { useVideoTrimmer, type VideoTrimmerResult } from "@/lib/videoTrim";
import { Feather } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Video from "react-native-video";

const MAX_TRIM_MS = 30_000;

const safeDelete = (path?: string) => {
  // blob:/http(s): urls (web) are not files on disk
  if (!path?.startsWith("file://")) return;
  try {
    const file = new File(path);
    if (file.exists) file.delete();
  } catch {
    // file already gone or not deletable, nothing to do
  }
};

export default function AttachmentReview() {
  const params = useLocalSearchParams<{ uri: string; type?: string }>();
  const originalUri = params.uri;
  const isVideo = params.type === "video";

  // Current file shown in the preview and used later for sending.
  // Starts as the original, becomes the trimmed file after trimming.
  const [uri, setUri] = useState<string>(originalUri);
  const uriRef = useRef<string>(originalUri);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const theme = useTheme();
  const colors = theme.colors;

  const handleVideoSend = async (uri: string) => {};

  const handleImageSend = async (uri: string) => {
    const img = new File(uri).readableStream(); // init a stream
    const reader = img.getReader(); // get a reader to read the stream in chunks
    const bufferSize = 1024 * 1024; // 1MB
    let bufferBytes = 0; // keeps track of the total bytes read
    let buffer = []; // keeps track of the chunks read
    while (true) {
      // reads the iamge file in chunks one by one
      const readImg = await reader.read();

      if (readImg.done) break; // if steam is completely read break the loop

      buffer.push(readImg.value);
      bufferBytes += readImg.value?.byteLength || 0;

      if (bufferSize <= bufferBytes) {
        let mergeChunk = [];
        for (let chunk of buffer) {
          mergeChunk.push(...chunk); // merge the chunks to a single array of 1MB
        }
        // encrypt the merge chunk of 1MB
        await encryptImage({ image: new Uint8Array(mergeChunk) });

        // resets the buffer and the bufferbytes
        buffer = [];
        bufferBytes = 0;
      }
    }
  };
  // Native: opens the react-native-video-trim editor and listens for its
  // events. Web: renders the ffmpeg based trim panel instead.
  const handleTrimmerResult = (result: VideoTrimmerResult) => {
    if (result) {
      // delete the previous trimmed file (never the original here)
      if (uriRef.current !== originalUri) safeDelete(uriRef.current);

      uriRef.current = result;
      setUri(result);
    }
    setIsPlaying(true);
  };

  const { openTrimmer, trimmer } = useVideoTrimmer({
    uri,
    maxDurationMs: MAX_TRIM_MS,
    onResult: handleTrimmerResult,
  });

  const handleOpenTrimmer = () => {
    setIsPlaying(false);
    openTrimmer();
  };

  const handleGoBack = () => {
    // delete both the original and any trimmed file
    safeDelete(originalUri);
    if (uriRef.current !== originalUri) safeDelete(uriRef.current);
    router.back();
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          {/* Top bar */}
          <View
            style={{
              height: 60,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.pillInactiveBg,
              }}
              onPress={handleGoBack}
            >
              <Feather name="x" size={22} color={colors.text} />
            </Pressable>

            {/* Trim button, videos only */}
            {isVideo ? (
              <Pressable
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.pillInactiveBg,
                }}
                onPress={handleOpenTrimmer}
              >
                <Feather name="scissors" size={18} color={colors.icon} />
              </Pressable>
            ) : (
              <View style={{ width: 40, height: 40 }} />
            )}
          </View>

          {/* Preview */}
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            {isVideo ? (
              <View style={{ width: "100%", height: "100%" }}>
                <Video
                  key={uri} // remount when the source changes after trimming
                  source={{ uri }}
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 16,
                  }}
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
                  onPress={() => setIsPlaying((playing) => !playing)}
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
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 16,
                }}
              />
            )}
          </View>

          {/* Bottom composer */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 24,
                paddingHorizontal: 18,
                justifyContent: "center",
                backgroundColor: colors.pillInactiveBg,
              }}
            >
              <TextInput
                placeholder="Add a caption..."
                placeholderTextColor={colors.pillInactiveText}
                style={{
                  color: colors.text,
                  fontSize: 15,
                  paddingVertical: 0,
                }}
              />
            </View>

            <Pressable
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.tint,
              }}
              onPress={async () => {
                if (isVideo) {
                  await handleVideoSend(uriRef.current);
                } else {
                  await handleImageSend(uriRef.current);
                }
              }}
              // the file to encrypt and send is `uri` (trimmed if the user trimmed)
            >
              <Feather name="send" size={20} color={colors.background} />
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>

      {/* Platform trimmer overlay (web only, native opens its own editor) */}
      {trimmer}
    </SafeAreaView>
  );
}

import { useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useTheme } from "@/constants/theme-provider";
import { getActiveConversation } from "@/lib/sync";
import { useVideoTrimmer, type VideoTrimmerResult } from "@/lib/videoTrim";
import { ReviewComposer } from "./ReviewComposer";
import { ReviewPreview } from "./ReviewPreview";
import { ReviewThumbnails } from "./ReviewThumbnails";
import { ReviewTopBar } from "./ReviewTopBar";
import { useSendImages } from "./useSendImages";
import { deleteTempFile, isVideoAsset, parseAssets, safeDelete } from "./utils";
import type { SendImage, SendVideo } from "./types";

const MAX_TRIM_MS = 30_000;

export function AttachmentReviewScreen() {
  const params = useLocalSearchParams<{
    uri?: string;
    type?: string;
    conversationId: string;
    assets?: string;
  }>();

  const assets = parseAssets(params.assets);
  const originalUri = params.uri;
  const initialUri = originalUri ?? assets[0]?.uri;

  // the camera flow pushes this screen without a `conversationId` param, so fall
  // back to the conversation the chat screen published globally while mounted
  const paramConversationId = Number(params.conversationId);
  const conversationId = Number.isFinite(paramConversationId)
    ? paramConversationId
    : getActiveConversation();

  const { colors } = useTheme();

  // current file shown in the preview and used later for sending.
  // starts as the original, becomes the trimmed file after trimming
  const [uri, setUri] = useState<string | undefined>(initialUri);
  const uriRef = useRef<string | undefined>(initialUri);
  const [isPlaying, setIsPlaying] = useState(true);
  const [caption, setCaption] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isVideo =
    params.type === "video" ||
    (params.type === "array" && isVideoAsset(assets[selectedIndex]));

  const { send, sending } = useSendImages({ conversationId });

  // files we must never delete: the original and everything the picker handed us
  const keepUris = [originalUri, ...assets.map((asset) => asset.uri)];

  const handleTrimmerResult = (result: VideoTrimmerResult) => {
    if (result) {
      deleteTempFile(uriRef.current, keepUris);
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
    if (!uri) return;
    setIsPlaying(false);
    openTrimmer();
  };

  const handleSelectAsset = (index: number) => {
    const asset = assets[index];
    if (!asset) return;

    deleteTempFile(uriRef.current, keepUris);
    uriRef.current = asset.uri;
    setUri(asset.uri);
    setSelectedIndex(index);
    setIsPlaying(true);
  };

  const handleGoBack = () => {
    // delete both the original and any trimmed file
    safeDelete(originalUri);
    deleteTempFile(uriRef.current, keepUris);
    router.back();
  };

  const handleSend = () => {
    // gallery assets carry their dimensions so they can be compressed on send.
    // a trimmed gallery video replaces the currently selected asset's uri.
    const images: SendImage[] = [];
    const videos: SendVideo[] = [];

    assets.forEach((asset, index) => {
      const assetUri =
        index === selectedIndex && uriRef.current ? uriRef.current : asset.uri;

      if (isVideoAsset(asset)) {
        videos.push({
          uri: assetUri,
          width: asset.width,
          height: asset.height,
          size: asset.fileSize,
          mimeType: asset.mimeType,
        });
      } else {
        images.push({
          uri: assetUri,
          width: asset.width,
          height: asset.height,
          size: asset.fileSize,
        });
      }
    });

    // single-file flow (camera photo / video) with no gallery assets.
    if (!assets.length && uriRef.current) {
      if (isVideo) {
        videos.push({ uri: uriRef.current });
      } else {
        images.push({ uri: uriRef.current });
      }
    }

    if (!images.length && !videos.length) return;

    send({ images, videos, caption });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
          <ReviewTopBar
            isVideo={isVideo}
            onBack={handleGoBack}
            onTrim={handleOpenTrimmer}
          />

          <ReviewPreview
            uri={uri}
            isVideo={isVideo}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((playing) => !playing)}
          />

          {params.type === "array" && assets.length > 1 && (
            <ReviewThumbnails
              assets={assets}
              selectedIndex={selectedIndex}
              onSelect={handleSelectAsset}
            />
          )}

          <ReviewComposer
            caption={caption}
            onCaptionChange={setCaption}
            onSend={handleSend}
            sending={sending}
            disabled={!uri}
          />
        </Pressable>
      </KeyboardAvoidingView>

      {/* Platform trimmer overlay (web only, native opens its own editor) */}
      {trimmer}
    </SafeAreaView>
  );
}

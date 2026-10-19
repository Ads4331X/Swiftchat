import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, router } from "expo-router";
import { getActiveConversation } from "@/features/chat/services/sync";
import {
  useVideoTrimmer,
  type VideoTrimmerResult,
} from "@/features/attachments/services/videoTrim";
import { ReviewComposer } from "@/features/attachments/components/review/ReviewComposer";
import { ReviewPreview } from "@/features/attachments/components/review/ReviewPreview";
import { ReviewThumbnails } from "@/features/attachments/components/review/ReviewThumbnails";
import { ReviewTopBar } from "@/features/attachments/components/review/ReviewTopBar";
import { DocumentPreview } from "@/features/attachments/components/review/DocumentPreview";
import { useSendAttachments } from "@/features/attachments/hooks/useSendAttachments";
import type { SendAttachment } from "@/features/chat/services/sendAttachment";
import {
  deleteTempFile,
  isVideoAsset,
  parseAssets,
  safeDelete,
} from "@/features/attachments/components/review/utils";

const MAX_TRIM_MS = 30_000;
const MAX_CONTENT_WIDTH = 640; // keeps the layout tidy on wide web screens

// WhatsApp-style: media review is always dark, regardless of app theme.
const BG = "#000000";

export function AttachmentReviewScreen() {
  const params = useLocalSearchParams<{
    uri?: string;
    type?: string;
    conversationId: string;
    assets?: string;
    name?: string;
    mimeType?: string;
    size?: string;
  }>();

  const isDocument = params.type === "document";
  const documentMimeType = params.mimeType ?? "";
  const documentSize = Number(params.size) || 0;

  const assets = parseAssets(params.assets);
  const originalUri = params.uri;
  const initialUri = originalUri ?? assets[0]?.uri;

  // The camera flow may not provide a conversationId.
  const paramConversationId = Number(params.conversationId);
  const conversationId = Number.isFinite(paramConversationId)
    ? paramConversationId
    : getActiveConversation();

  // Current file shown in the preview and used later for sending.
  const [uri, setUri] = useState<string | undefined>(initialUri);
  const uriRef = useRef<string | undefined>(initialUri);
  const [isPlaying, setIsPlaying] = useState(true);
  const [caption, setCaption] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isVideo =
    !isDocument &&
    (params.type === "video" ||
      (params.type === "array" && isVideoAsset(assets[selectedIndex])));

  const { send, sending } = useSendAttachments({ conversationId });

  // Files we must never delete: the original and everything the picker handed us.
  const keepUris = [originalUri, ...assets.map((asset) => asset.uri)];
  const keepUrisRef = useRef(keepUris);
  keepUrisRef.current = keepUris;

  // The trimmed copy is temporary; delete it when the screen goes away.
  useEffect(
    () => () => deleteTempFile(uriRef.current, keepUrisRef.current),
    [],
  );

  const handleTrimmerResult = (result: VideoTrimmerResult) => {
    if (result) {
      deleteTempFile(uriRef.current, keepUris);
      uriRef.current = result;
      setUri(result);
    }
    setIsPlaying(true);
  };

  const { openTrimmer, trimmer } = useVideoTrimmer({
    uri: isVideo ? uri : undefined,
    maxDurationMs: MAX_TRIM_MS,
    onResult: handleTrimmerResult,
  });

  const handleOpenTrimmer = () => {
    if (!uri || isDocument || !isVideo) return;

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
    // Don't delete a document selected by the user.
    if (!isDocument) {
      safeDelete(originalUri);
    }

    deleteTempFile(uriRef.current, keepUris);
    router.back();
  };

  const handleSend = () => {
    const attachments: SendAttachment[] = [];

    // Gallery flow: images and videos.
    assets.forEach((asset, index) => {
      const trimmed = index === selectedIndex && uriRef.current !== asset.uri;
      const assetUri = trimmed ? uriRef.current! : asset.uri;
      const kind = isVideoAsset(asset) ? "video" : "image";

      // A trimmed clip is already short, so skip the metadata-driven re-encode.
      if (trimmed) {
        attachments.push({ uri: assetUri, kind });
        return;
      }

      attachments.push({
        uri: assetUri,
        kind,
        width: asset.width,
        height: asset.height,
        size: asset.fileSize,
        mimeType: asset.mimeType,
      });
    });

    // Single-file flow: document, camera photo, or camera video.
    if (!assets.length && uriRef.current) {
      if (isDocument) {
        attachments.push({
          uri: uriRef.current,
          kind: "document",
          name: params.name,
          size: documentSize,
          mimeType: documentMimeType,
        });
      } else {
        attachments.push({
          uri: uriRef.current,
          kind: isVideo ? "video" : "image",
        });
      }
    }

    if (!attachments.length) return;

    send({ attachments, caption });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MAX_CONTENT_WIDTH,
          alignSelf: "center",
        }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {isDocument ? (
          <DocumentPreview
            name={params.name}
            mimeType={documentMimeType}
            size={documentSize}
            uri={uri}
            onBack={handleGoBack}
          />
        ) : (
          <>
            <ReviewTopBar
              isVideo={isVideo}
              onBack={handleGoBack}
              onTrim={handleOpenTrimmer}
            />

            {/* Tapping the preview area dismisses the keyboard. */}
            <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
              <ReviewPreview
                uri={uri}
                isVideo={isVideo}
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((playing) => !playing)}
              />
            </Pressable>
          </>
        )}

        {/* Thumbnails sit right above the caption bar, like WhatsApp. */}
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
      </KeyboardAvoidingView>

      {/* Platform trimmer overlay (web only, native opens its own editor). */}
      {trimmer}
    </SafeAreaView>
  );
}


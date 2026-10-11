import { useTheme } from "@/constants/theme-provider";
import { api } from "@/lib/api";
import { encryptImage } from "@/lib/crypto";
import { getConversationOtherUser, saveMessage } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { createAttachment } from "@/lib/db/attachments";
import { getActiveConversation } from "@/lib/sync";
import { appendEncryptedFile } from "@/lib/storage/uploadFile";
import { useVideoTrimmer, type VideoTrimmerResult } from "@/lib/videoTrim";
import { Feather } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const params = useLocalSearchParams<{
    uri: string;
    type?: string;
    conversationId: string;
  }>();
  const originalUri = params.uri;
  const isVideo = params.type === "video";

  // The camera flow pushes this screen without a `conversationId` param, so fall
  // back to the conversation the chat screen published globally while mounted.
  const paramConversationId = Number(params.conversationId);
  const conversationId = Number.isFinite(paramConversationId)
    ? paramConversationId
    : getActiveConversation();

  // Current file shown in the preview and used later for sending.
  // Starts as the original, becomes the trimmed file after trimming.
  const [uri, setUri] = useState<string>(originalUri);
  const uriRef = useRef<string>(originalUri);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [caption, setCaption] = useState<string>("");

  const theme = useTheme();
  const colors = theme.colors;

  const handleVideoSend = async (uri: string) => {};

  const handleImageSend = async (uri: string) => {
    if (conversationId == null) {
      console.warn("AttachmentReview: no conversationId available");
      return;
    }
    setLoading(true);
    let messageId: number | null = null;
    try {
      // encryptes the image locally
      const encryptImg = await encryptImage({
        uri,
        conversationId,
        caption,
      });

      // datas to upload
      const formData = new FormData();

      appendEncryptedFile(formData, {
        uri: encryptImg.encryptedImageUri,
        uuid: encryptImg.uuid,
        mimeType: encryptImg.mimeType,
      });

      formData.append("conversationId", String(conversationId));
      formData.append("encryptedKey", encryptImg.encryptedKey);
      formData.append("keyNonce", encryptImg.keyNonce);
      formData.append("encryptedHeader", encryptImg.encryptedHeader);
      formData.append("headerNonce", encryptImg.headerNonce);
      formData.append("messageText", encryptImg.encryptedText);
      formData.append("nonce", encryptImg.nonce);

      // TEMP DIAGNOSTIC
      {
        const p = encryptImg.encryptedImageUri;
        let exists: unknown = "n/a (non-file uri)";
        let size: unknown = "n/a";
        if (p?.startsWith("file://")) {
          const f = new File(p);
          exists = f.exists;
          size = f.size;
        }
        console.log("UPLOAD DIAGNOSTIC", {
          uri: p,
          exists,
          size,
          mimeType: encryptImg.mimeType,
          fileSize: encryptImg.fileSize,
          apiUrl: process.env.EXPO_PUBLIC_API_URL,
        });
      }

      // upload the data to the server
      const response = await api.post("/api/conversations/messages", formData);

      const createdMessageId = Number(response.data.id); // the message id
      messageId = createdMessageId;

      // saves locally the files metadata
      await createAttachment({
        messageId: createdMessageId,
        localPath: encryptImg.encryptedImageUri,
        mimeType: encryptImg.mimeType,
        fileSize: encryptImg.fileSize,
        encryptedKey: encryptImg.encryptedKey,
        keyNonce: encryptImg.keyNonce,
        encryptedHeader: encryptImg.encryptedHeader,
        headerNonce: encryptImg.headerNonce,
        uuid: encryptImg.uuid,
      });

      await saveMessage({
        messageId: createdMessageId,
        message: response.data.text,
        sentAt: String(response.data.sentAt),
        SenderId: Number(response.data.senderId),
        ConversationId: Number(response.data.conversationId),
        nonce: response.data.nonce,
      });
    } catch (err: any) {
      // TEMP DIAGNOSTIC
      console.log("UPLOAD FAILED", {
        message: err?.message,
        status: err?.response?.status,
        data: err?.response?.data,
        rnError: err?.request?.responseText,
        code: err?.code,
      });
      throw err;
    } finally {
      setLoading(false);
    }

    if (messageId == null) return;

    const currentUserId = await getCurrentUserId();
    const cached = await getConversationOtherUser(conversationId);

    // Seed from the local cache, then refresh from the server (which also
    // covers group conversations the cache doesn't track).
    let username = cached?.otherUsername ?? "";
    let avatarUrl = cached?.otherAvatarUrl ?? "";
    let memberIds = cached?.otherUserId ? [cached.otherUserId] : [];

    try {
      const { data } = await api.get("/api/conversations");
      const conversations: any[] = Array.isArray(data) ? data : [];
      const conversation = conversations.find(
        (item) =>
          String(item.conversationId ?? item.id) === String(conversationId),
      );

      const conversationMembers: any[] = conversation?.members ?? [];

      // `memberIds` excludes the current user, matching the convention used by
      // the chat list and the /chat/[id] screen's `isGroup` detection.
      const others = conversationMembers
        .map((member) => Number(member.id))
        .filter((id) => Number.isFinite(id) && id !== currentUserId);

      if (others.length) {
        memberIds = others;

        const other = conversationMembers.find(
          (member) => Number(member.id) === others[0],
        );

        if (other) {
          username = other.username ?? username;
          avatarUrl = other.avatar ?? other.avatarUrl ?? avatarUrl;

          // The cached avatar can be null; pull the freshest value.
          const { data: profile } = await api.get(`/api/user/${others[0]}`);
          username = profile?.username ?? username;
          avatarUrl = profile?.avatar ?? profile?.avatarUrl ?? avatarUrl;
        }
      }
    } catch {
      // fall back to the locally cached values
    }

    router.push({
      pathname: "/chat/[id]",
      params: {
        id: String(conversationId),
        username,
        avatarUrl,
        memberIds: memberIds.join(","),
        messageId: String(messageId),
      },
    });
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
                value={caption}
                onChangeText={(text) => setCaption(text)}
              />
            </View>

            <Pressable
              disabled={loading}
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.tint,
                opacity: loading ? 0.6 : 1,
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
              {loading ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Feather name="send" size={20} color={colors.background} />
              )}
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>

      {/* Platform trimmer overlay (web only, native opens its own editor) */}
      {trimmer}
    </SafeAreaView>
  );
}

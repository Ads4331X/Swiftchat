import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BRAND_COLOR } from "@/shared/theme/theme";

import type { OngoingCall } from "../types";
import { useCall } from "../use-call";
import type { CallVideoProps } from "./call-video-types";
import CallAudio from "./CallAudio";
import CallVideo from "./CallVideo";
import CallWhiteboard from "./CallWhiteboard";

export default function CallOverlay() {
  const {
    call,
    localStream,
    remoteStreams,
    isMuted,
    isSpeakerOn,
    isCameraOn,
    isCameraBusy,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    flipCamera,
  } = useCall();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWhiteboardVisible, setIsWhiteboardVisible] = useState(false);
  const pendingChatConversationId = useRef<number | null>(null);

  useEffect(() => {
    setIsMinimized(false);
    setIsWhiteboardVisible(false);
  }, [call?.callId]);

  useEffect(() => {
    if (!isMinimized || pendingChatConversationId.current === null) return;

    const conversationId = pendingChatConversationId.current;
    pendingChatConversationId.current = null;
    router.navigate({
      pathname: "/chat/[id]",
      params: { id: String(conversationId) },
    });
  }, [isMinimized]);

  useEffect(() => {
    if (!call?.connectedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - call.connectedAt!) / 1000)),
      );
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [call?.callId, call?.connectedAt]);

  if (!call) return null;

  if (isMinimized) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to call"
        onPress={() => setIsMinimized(false)}
        style={styles.minimizedCall}
      >
        <Feather name={call.callType === "video" ? "video" : "phone"} size={18} color="#fff" />
        <Text style={styles.minimizedCallText}>
          {call.participantName} · {statusText(call, elapsedSeconds)}
        </Text>
        <Feather name="chevron-up" size={20} color="#fff" />
      </Pressable>
    );
  }

  const remoteVideoStreams = remoteStreams.filter(
    ({ stream }) => stream.getVideoTracks().length > 0,
  );
  const hasLocalVideoTrack = Boolean(localStream?.getVideoTracks().length);
  const isVideo =
    call.callType === "video" ||
    hasLocalVideoTrack ||
    remoteVideoStreams.length > 0;
  const isIncoming = call.direction === "incoming" && call.status === "incoming";
  const showLocalVideo =
    isVideo && hasLocalVideoTrack && localStream && isCameraOn;
  const showRemoteVideo = isVideo && remoteVideoStreams.length > 0;
  const showVideoGrid = isVideo && remoteVideoStreams.length > 1;

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (isIncoming) {
          void declineCall();
        } else {
          void endCall();
        }
      }}
    >
      <View className="flex-1 bg-[#0B0F10]">
        {showVideoGrid ? (
          <ScrollView
            style={styles.videoGrid}
            contentContainerStyle={styles.videoGridContent}
            showsVerticalScrollIndicator={false}
          >
            {remoteVideoStreams.map(({ participantId, stream }) => (
              <View key={participantId} style={styles.participantTile}>
                <CallVideo
                  stream={stream}
                  style={StyleSheet.absoluteFill}
                  objectFit="cover"
                />
                <Text style={styles.participantLabel}>
                  Participant {participantId}
                </Text>
              </View>
            ))}
            {showLocalVideo ? (
              <View style={styles.participantTile}>
                <DoubleTapCallVideo
                  stream={localStream}
                  style={StyleSheet.absoluteFill}
                  objectFit="cover"
                  mirror
                  muted
                  onDoubleTap={flipCamera}
                />
                <Text style={styles.participantLabel}>You</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : showRemoteVideo ? (
          <CallVideo
            stream={remoteVideoStreams[0].stream}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : showLocalVideo ? (
          <DoubleTapCallVideo
            stream={localStream}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
            mirror
            muted
            onDoubleTap={flipCamera}
          />
        ) : (
          <View className="absolute inset-0 items-center justify-center">
            {remoteStreams.map(({ participantId, stream }) => (
              <CallAudio key={participantId} stream={stream} />
            ))}
            <View
              className="h-28 w-28 items-center justify-center rounded-full"
              style={{ backgroundColor: BRAND_COLOR + "33" }}
            >
              <Feather
                name={isVideo ? "video" : "phone"}
                size={46}
                color="#fff"
              />
            </View>
          </View>
        )}

        <SafeAreaView
          className="absolute inset-x-0 top-0"
          edges={["top", "left", "right"]}
        >
          <View style={styles.header}>
            <Text
              numberOfLines={1}
              style={styles.participantName}
            >
              {call.participantCount > 2 ? "Group call" : call.participantName}
            </Text>
            <Text style={styles.callStatus}>
              {statusText(call, elapsedSeconds)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimize call"
            onPress={() => setIsMinimized(true)}
            style={styles.minimizeButton}
          >
            <Feather name="chevron-down" size={24} color="#fff" />
          </Pressable>
        </SafeAreaView>

        {showRemoteVideo && !showVideoGrid && showLocalVideo ? (
          <View className="absolute right-4 top-24 h-[148px] w-[104px] overflow-hidden rounded-[14px] border border-white/35 bg-[#111]">
            <DoubleTapCallVideo
              stream={localStream}
              style={styles.localVideo}
              objectFit="cover"
              mirror
              muted
              zOrder={1}
              onDoubleTap={flipCamera}
            />
            <Text style={styles.participantLabel}>You</Text>
          </View>
        ) : null}

        <SafeAreaView className="absolute inset-x-0 bottom-0" edges={["bottom"]}>
          <View style={styles.controlDock}>
            {isIncoming ? (
              <>
                <CallButton
                  icon="phone-off"
                  label="Decline"
                  color="#EF4444"
                  onPress={() => void declineCall()}
                />
                <CallButton
                  icon="phone"
                  label="Accept"
                  color="#22C55E"
                  onPress={() => void acceptCall()}
                />
              </>
            ) : (
              <>
                {localStream ? (
                  <>
                    <CallButton
                      icon={isMuted ? "mic-off" : "mic"}
                      label={isMuted ? "Unmute" : "Mute"}
                      active={isMuted}
                      slashed={isMuted}
                      onPress={toggleMute}
                    />
                    {Platform.OS !== "web" ? (
                      <CallButton
                        icon={isSpeakerOn ? "volume-2" : "volume-x"}
                        label={isSpeakerOn ? "Speaker on" : "Speaker off"}
                        active={isSpeakerOn}
                        slashed={!isSpeakerOn}
                        onPress={toggleSpeaker}
                      />
                    ) : null}
                    <CallButton
                      icon={isCameraOn ? "video" : "video-off"}
                      label={isCameraOn ? "Camera off" : "Enable camera"}
                      active={!isCameraOn}
                      slashed={!isCameraOn}
                      onPress={() => void toggleVideo()}
                      disabled={isCameraBusy}
                    />
                    {hasLocalVideoTrack ? (
                      <CallButton
                        icon="refresh-cw"
                        label="Switch camera"
                        onPress={() => void flipCamera()}
                        disabled={isCameraBusy}
                      />
                    ) : null}
                    <CallButton
                      icon="message-circle"
                      label="Chat"
                      onPress={() => {
                        pendingChatConversationId.current = call.conversationId;
                        setIsMinimized(true);
                      }}
                    />
                    <CallButton
                      icon="edit-3"
                      label="Board"
                      onPress={() => setIsWhiteboardVisible(true)}
                    />
                  </>
                ) : null}
                <CallButton
                  icon="phone-off"
                  label="End"
                  color="#EF4444"
                  onPress={() => void endCall()}
                />
              </>
            )}
          </View>
        </SafeAreaView>
        <CallWhiteboard
          callId={call.callId}
          visible={isWhiteboardVisible}
          onClose={() => setIsWhiteboardVisible(false)}
        />
      </View>
    </Modal>
  );
}

function statusText(call: OngoingCall, elapsedSeconds: number) {
  switch (call.status) {
    case "outgoing":
      return "Ringing…";
    case "incoming":
      return `Incoming ${call.callType} call`;
    case "connecting":
      return "Connecting…";
    case "active":
      return `${call.participantIds.length + 1} participants · ${formatElapsedTime(elapsedSeconds)}`;
    case "ended":
      return "Call ended";
    case "failed":
      return "Call failed";
    default:
      return "";
  }
}

function formatElapsedTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function DoubleTapCallVideo({
  onDoubleTap,
  ...videoProps
}: CallVideoProps & { onDoubleTap: () => void }) {
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    },
    [],
  );

  const handlePress = () => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onDoubleTap();
      return;
    }

    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
    }, 300);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Double tap to switch camera"
      onPress={handlePress}
      style={StyleSheet.absoluteFill}
    >
      <CallVideo {...videoProps} style={StyleSheet.absoluteFill} />
    </Pressable>
  );
}

function CallButton({
  icon,
  label,
  color,
  active = false,
  slashed = false,
  disabled = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  color?: string;
  active?: boolean;
  slashed?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const backgroundColor = color ?? (active ? "#fff" : "rgba(255,255,255,0.18)");
  const foregroundColor = color ? "#fff" : active ? "#11181C" : "#fff";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      onPress={onPress}
      disabled={disabled}
      className="min-w-[76px] items-center justify-center gap-1.5 rounded-2xl px-3 py-3"
      style={({ pressed }) => ({
        backgroundColor,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <View style={styles.iconContainer}>
        <Feather name={icon} size={24} color={foregroundColor} />
        {slashed ? (
          <View
            pointerEvents="none"
            style={[styles.iconSlash, { backgroundColor: foregroundColor }]}
          />
        ) : null}
      </View>
      <Text style={[styles.buttonLabel, { color: foregroundColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: "center",
    height: 26,
    justifyContent: "center",
    width: 28,
  },
  iconSlash: {
    height: 2,
    position: "absolute",
    transform: [{ rotate: "45deg" }],
    width: 30,
  },
  localVideo: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(10, 15, 18, 0.72)",
    borderRadius: 20,
    marginTop: 12,
    maxWidth: "84%",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  minimizeButton: {
    alignItems: "center",
    backgroundColor: "rgba(10, 15, 18, 0.72)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    left: 12,
    marginTop: 10,
    position: "absolute",
    top: 0,
    width: 44,
  },
  participantName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  callStatus: {
    color: "rgba(255, 255, 255, 0.78)",
    fontSize: 14,
    marginTop: 3,
  },
  controlDock: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(10, 15, 18, 0.82)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    maxWidth: "94%",
  },
  buttonLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  videoGrid: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 100,
    paddingBottom: 120,
  },
  videoGridContent: {
    alignContent: "center",
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  participantTile: {
    backgroundColor: "#11181C",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: "48%",
    flexGrow: 1,
    margin: 3,
    overflow: "hidden",
    aspectRatio: 0.75,
  },
  participantLabel: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(10,15,18,0.72)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    margin: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  minimizedCall: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#142126",
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 20,
    flexDirection: "row",
    gap: 10,
    left: 16,
    maxWidth: "92%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: "absolute",
    right: 16,
  },
  minimizedCallText: {
    color: "#fff",
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
});

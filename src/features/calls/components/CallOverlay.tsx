import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import Toast from "react-native-toast-message";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { BRAND_COLOR } from "@/shared/theme/theme";
import Avatar from "@/features/profile/components/Avatar";
import { getConversationOtherUser, getUser } from "@/core/db";
import { getCurrentUserId } from "@/features/auth/services";

import { shouldMirrorLocalVideo } from "../call-video-utils";
import type { OngoingCall } from "../types";
import { useCall } from "../use-call";
import type { CallVideoProps } from "./call-video-types";
import CallAudio from "./CallAudio";
import CallVideo from "./CallVideo";
import CallScreenShareViewer from "./CallScreenShareViewer";
import CallWhiteboard from "./CallWhiteboard";

type CallAvatarData = {
  username: string;
  avatarUrl?: string | null;
  localAvatarUrlPath: string | null;
};

// --- Pulse animation for ringing/connecting states ---

function PulseRing({ color = BRAND_COLOR }: { color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduceMotion(preference.matches);
      const onPreferenceChange = (event: MediaQueryListEvent) =>
        setReduceMotion(event.matches);
      preference.addEventListener("change", onPreferenceChange);
      return () =>
        preference.removeEventListener("change", onPreferenceChange);
    }

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(enabled);
      })
      .catch((error: unknown) => {
        console.warn("Could not read reduced-motion preference:", error);
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      opacity.setValue(0.45);
      return;
    }

    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.6,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.5,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, {
        borderRadius: 80,
        borderWidth: 2.5,
        borderColor: color,
        transform: [{ scale }],
        opacity,
      }]}
    />
  );
}

export default function CallOverlay() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const {
    call,
    localStream,
    remoteStreams,
    remoteCameraStates,
    remoteScreenShareStates,
    isMuted,
    isSpeakerOn,
    isCameraOn,
    isCameraBusy,
    isSharingScreen,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    flipCamera,
    toggleScreenShare,
  } = useCall();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isWhiteboardVisible, setIsWhiteboardVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [moreControlsVisible, setMoreControlsVisible] = useState(false);
  const [controlActivity, setControlActivity] = useState(0);
  const pendingChatConversationId = useRef<number | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localAvatar, setLocalAvatar] = useState<CallAvatarData>({
    username: "You",
    localAvatarUrlPath: null,
  });
  const [participantAvatars, setParticipantAvatars] = useState<
    Record<number, CallAvatarData>
  >({});
  const [remoteVideoAspectRatios, setRemoteVideoAspectRatios] = useState<
    Record<number, number>
  >({});
  const callId = call?.callId;
  const conversationId = call?.conversationId;
  const callParticipantId = call?.participantId;
  const callParticipantName = call?.participantName;
  const isAnyScreenShareActive =
    isSharingScreen || Object.values(remoteScreenShareStates).some(Boolean);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    setControlActivity((activity) => activity + 1);
  }, []);

  const toggleCallControls = useCallback(() => {
    setControlsVisible((visible) => !visible);
    setMoreControlsVisible(false);
    setControlActivity((activity) => activity + 1);
  }, []);

  useEffect(() => {
    setIsMinimized(false);
    setIsWhiteboardVisible(false);
    setControlsVisible(true);
    setMoreControlsVisible(false);
  }, [call?.callId]);

  useEffect(() => {
    if (call?.status !== "active") {
      setControlsVisible(true);
      setMoreControlsVisible(false);
    }
  }, [call?.status]);

  useEffect(() => {
    if (
      call?.status !== "active" ||
      !controlsVisible ||
      moreControlsVisible ||
      isWhiteboardVisible ||
      isAnyScreenShareActive
    ) {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      controlsTimer.current = null;
      return;
    }

    controlsTimer.current = setTimeout(() => {
      setControlsVisible(false);
      controlsTimer.current = null;
    }, 4000);

    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
      controlsTimer.current = null;
    };
  }, [
    call?.callId,
    call?.status,
    controlsVisible,
    controlActivity,
    isAnyScreenShareActive,
    isWhiteboardVisible,
    moreControlsVisible,
  ]);

  useEffect(() => {
    if (!isMinimized || pendingChatConversationId.current === null) return;

    const conversationId = pendingChatConversationId.current;
    pendingChatConversationId.current = null;
    const task = InteractionManager.runAfterInteractions(() => {
      router.navigate({
        pathname: "/chat/[id]",
        params: { id: String(conversationId) },
      });
    });
    return () => task.cancel();
  }, [isMinimized]);

  useEffect(() => {
    if (
      callId == null ||
      conversationId == null ||
      callParticipantId == null
    ) {
      setParticipantAvatars({});
      return;
    }

    let cancelled = false;
    const participantIds = new Set([
      callParticipantId,
      ...remoteStreams.map(({ participantId }) => participantId),
    ]);

    void (async () => {
      const currentUserId = await getCurrentUserId();
      const currentUser = currentUserId ? await getUser(currentUserId) : null;
      if (cancelled) return;
      setLocalAvatar({
        username: currentUser?.username ?? "You",
        avatarUrl: currentUser?.avatarUrl,
        localAvatarUrlPath: currentUser?.localAvatarUrlPath ?? null,
      });

      const conversationUser = await getConversationOtherUser(
        conversationId,
      );
      const entries = await Promise.all(
        [...participantIds].map(async (participantId) => {
          const user = await getUser(participantId);
          const cachedAvatar =
            participantId === conversationUser?.otherUserId
              ? conversationUser.otherAvatarUrl
              : null;
          return [
            participantId,
            {
              username:
                user?.username ??
                (participantId === callParticipantId
                  ? (callParticipantName ?? "Participant")
                  : `Participant ${participantId}`),
              avatarUrl: user?.avatarUrl ?? cachedAvatar,
              localAvatarUrlPath: user?.localAvatarUrlPath ?? null,
            },
          ] as const;
        }),
      );

      const avatars: Record<number, CallAvatarData> = {};
      for (const [participantId, avatar] of entries) {
        avatars[participantId] = avatar;
      }
      if (!cancelled) setParticipantAvatars(avatars);
    })().catch((error: unknown) => {
      console.warn("Could not load call participant avatars:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    callId,
    conversationId,
    callParticipantId,
    callParticipantName,
    remoteStreams,
  ]);

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

  // --- Minimized call bar ---
  if (isMinimized) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to call"
        onPress={() => setIsMinimized(false)}
        className="absolute right-3 flex-row items-center rounded-full border border-white/20 bg-[#142126] px-2 py-2"
        style={[
          styles.minimizedCall,
          { top: Math.max(insets.top + 10, 16) },
        ]}
      >
        <View
          style={[
            styles.minimizedIconWrap,
            call.status === "active" && styles.minimizedIconActive,
          ]}
        >
          <Feather
            name={call.callType === "video" ? "video" : "phone"}
            size={14}
            color="#fff"
          />
        </View>
        <Text
          className="flex-1 text-sm font-semibold text-white"
          numberOfLines={1}
        >
          {call.participantCount > 2 ? "Group call" : call.participantName}
        </Text>
        <Text className="text-[13px] font-medium text-white/70">
          {call.status === "active"
            ? formatElapsedTime(elapsedSeconds)
            : statusLabel(call)}
        </Text>
        <Feather name="chevron-up" size={18} color="rgba(255,255,255,0.7)" />
      </Pressable>
    );
  }

  const remoteVideoStreams = remoteStreams.filter(
    ({ participantId, stream }) =>
      stream.getVideoTracks().length > 0 &&
      (remoteCameraStates[participantId] !== false ||
        remoteScreenShareStates[participantId] === true),
  );
  const remoteScreenShare = remoteStreams.find(
    ({ participantId, stream }) =>
      remoteScreenShareStates[participantId] === true &&
      stream.getVideoTracks().length > 0,
  );
  const screenShareStream = remoteScreenShare?.stream ??
    (isSharingScreen ? localStream : null);
  const screenSharerName = remoteScreenShare
    ? (participantAvatars[remoteScreenShare.participantId]?.username ??
      `Participant ${remoteScreenShare.participantId}`)
    : "You";
  const sharingParticipantId = remoteScreenShare?.participantId;
  const screenShareParticipantStreams = remoteVideoStreams.filter(
    ({ participantId }) => participantId !== sharingParticipantId,
  );
  const hasLocalVideoTrack = Boolean(localStream?.getVideoTracks().length);
  const isVideo =
    call.callType === "video" ||
    hasLocalVideoTrack ||
    remoteVideoStreams.length > 0;
  const isIncoming = call.direction === "incoming" && call.status === "incoming";
  const isRinging =
    call.status === "outgoing" ||
    call.status === "incoming" ||
    call.status === "connecting";
  const showLocalVideo =
    isVideo && hasLocalVideoTrack && localStream && isCameraOn && !isSharingScreen;
  const hasRemoteParticipant = remoteStreams.length > 0;
  const showScreenShareParticipants =
    screenShareParticipantStreams.length > 0 ||
    (showLocalVideo && !isSharingScreen);
  const showRemoteVideo = isVideo && remoteVideoStreams.length > 0;
  const showVideoGrid = isVideo && remoteVideoStreams.length > 1;
  const displayedRemoteVideoIds = new Set<number>();
  if (screenShareStream) {
    if (remoteScreenShare) {
      displayedRemoteVideoIds.add(remoteScreenShare.participantId);
    }
    screenShareParticipantStreams.forEach(({ participantId }) => {
      displayedRemoteVideoIds.add(participantId);
    });
  } else if (showVideoGrid) {
    remoteVideoStreams.forEach(({ participantId }) => {
      displayedRemoteVideoIds.add(participantId);
    });
  } else if (showRemoteVideo) {
    displayedRemoteVideoIds.add(remoteVideoStreams[0].participantId);
  }
  const audioOnlyRemoteStreams = remoteStreams.filter(
    ({ participantId }) => !displayedRemoteVideoIds.has(participantId),
  );
  const primaryRemoteTrack = remoteVideoStreams[0]?.stream.getVideoTracks()[0];
  const primaryRemoteSettings = primaryRemoteTrack?.getSettings();
  const primaryRemoteParticipantId = remoteVideoStreams[0]?.participantId;
  const localVideoSettings = localStream?.getVideoTracks()[0]?.getSettings();
  const mirrorLocalVideo = shouldMirrorLocalVideo(localStream);
  const primaryRemoteAspectRatio =
    (primaryRemoteParticipantId != null
      ? remoteVideoAspectRatios[primaryRemoteParticipantId]
      : undefined) ??
    (primaryRemoteSettings?.width && primaryRemoteSettings.height
      ? primaryRemoteSettings.width / primaryRemoteSettings.height
      : 16 / 9);
  const localVideoAspectRatio =
    localVideoSettings?.width && localVideoSettings.height
      ? localVideoSettings.width / localVideoSettings.height
      : 9 / 16;

  const displayName =
    call.participantCount > 2 ? "Group Call" : call.participantName;
  const canShareScreen =
    Platform.OS === "android" ||
    (Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function");
  const primaryAvatar =
    remoteStreams.length > 0
      ? (participantAvatars[remoteStreams[0].participantId] ?? {
          username: call.participantName,
          localAvatarUrlPath: null,
        })
      : (participantAvatars[call.participantId] ?? {
          username: call.participantName,
          localAvatarUrlPath: null,
        });

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (isIncoming) {
          void declineCall();
        } else {
          setIsMinimized(true);
        }
      }}
    >
      <View className="flex-1 bg-[#0B0F10]" style={styles.container}>
        {/* Background: gradient for non-video states, dark for video */}
        {!screenShareStream && !showRemoteVideo && !showVideoGrid ? (
          <LinearGradient
            colors={["#0D1B2A", "#1B2838", "#0D1B2A"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {audioOnlyRemoteStreams.map(({ participantId, stream }) => (
          <CallAudio key={`audio-${participantId}`} stream={stream} />
        ))}

        {screenShareStream ? (
          <>
            <View
              style={[
                styles.screenShareStage,
                showScreenShareParticipants && styles.screenShareStageWithRail,
              ]}
            >
              <CallScreenShareViewer
                stream={screenShareStream}
                sharerName={screenSharerName}
                isLocal={!remoteScreenShare}
                onSingleTap={toggleCallControls}
              />
            </View>
            {showScreenShareParticipants ? (
              <ScrollView
                horizontal
                style={styles.screenShareParticipantRail}
                contentContainerStyle={styles.screenShareParticipantContent}
                showsHorizontalScrollIndicator={false}
              >
                {screenShareParticipantStreams.map(
                  ({ participantId, stream }) => {
                    const avatar = participantAvatars[participantId];
                    return (
                      <View
                        key={participantId}
                        style={styles.screenShareParticipantTile}
                      >
                        <RemoteCallVideo
                          stream={stream}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.tileBadge}>
                          <Text style={styles.tileBadgeName} numberOfLines={1}>
                            {avatar?.username ?? `Participant ${participantId}`}
                          </Text>
                        </View>
                      </View>
                    );
                  },
                )}
                {showLocalVideo && !isSharingScreen ? (
                  <View style={styles.screenShareParticipantTile}>
                    <CallVideo
                      stream={localStream}
                      style={StyleSheet.absoluteFill}
                      objectFit="contain"
                      mirror={mirrorLocalVideo}
                      muted
                    />
                    <View style={styles.tileBadge}>
                      <Text style={styles.tileBadgeName}>You</Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </>
        ) : null}

        {/* === Video grid (group calls, multiple remotes) === */}
        {!screenShareStream && showVideoGrid ? (
          <ScrollView
            style={styles.videoGrid}
            contentContainerStyle={styles.videoGridContent}
            showsVerticalScrollIndicator={false}
          >
            {remoteVideoStreams.map(({ participantId, stream }) => {
              const avatar = participantAvatars[participantId];
              return (
                <View
                  key={participantId}
                  style={[
                    styles.participantTile,
                    windowWidth >= 1100 && styles.wideParticipantTile,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Show or hide call controls"
                    onPress={toggleCallControls}
                    style={StyleSheet.absoluteFill}
                  >
                    <RemoteCallVideo
                      key={`${participantId}-${remoteCameraStates[participantId] ?? true}`}
                      stream={stream}
                      style={StyleSheet.absoluteFill}
                    />
                  </Pressable>
                  {/* Participant info badge */}
                  <View style={styles.tileBadge}>
                    <Text style={styles.tileBadgeName} numberOfLines={1}>
                      {avatar?.username ?? `Participant ${participantId}`}
                    </Text>
                  </View>
                </View>
              );
            })}
            {localStream && isVideo ? (
              <View
                style={[
                  styles.participantTile,
                  windowWidth >= 1100 && styles.wideParticipantTile,
                ]}
              >
                {showLocalVideo ? (
                  <DoubleTapCallVideo
                    stream={localStream}
                    style={StyleSheet.absoluteFill}
                    objectFit="cover"
                    mirror={mirrorLocalVideo}
                    muted
                    onDoubleTap={flipCamera}
                  />
                ) : (
                  <View style={styles.gridAvatar}>
                    <CallAvatar participant={localAvatar} size={72} />
                  </View>
                )}
                <View style={styles.tileBadge}>
                  <Text style={styles.tileBadgeName}>You</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        ) : !screenShareStream && showRemoteVideo ? (
          /* === Single remote video (1-to-1) === */
          <View style={styles.singleVideoStage}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show or hide call controls"
              onPress={toggleCallControls}
              style={[
                styles.singleVideoFrame,
                { aspectRatio: primaryRemoteAspectRatio },
              ]}
            >
              <RemoteCallVideo
                key={`${remoteVideoStreams[0].participantId}-${remoteCameraStates[remoteVideoStreams[0].participantId] ?? true}`}
                stream={remoteVideoStreams[0].stream}
                style={StyleSheet.absoluteFill}
                onAspectRatioChange={(aspectRatio) =>
                  setRemoteVideoAspectRatios((current) => ({
                    ...current,
                    [remoteVideoStreams[0].participantId]: aspectRatio,
                  }))
                }
              />
            </Pressable>
            <LinearGradient
              colors={["rgba(0,0,0,0.45)", "transparent", "transparent", "rgba(0,0,0,0.55)"]}
              locations={[0, 0.2, 0.7, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
        ) : !screenShareStream &&
          showLocalVideo &&
          !showRemoteVideo &&
          !hasRemoteParticipant ? (
          /* === Local camera preview when no remote video is available === */
          <View style={styles.singleVideoStage}>
            <View
              style={[
                styles.singleVideoFrame,
                { aspectRatio: localVideoAspectRatio },
              ]}
            >
              <DoubleTapCallVideo
                stream={localStream}
                key={`${localStream.id}-${isCameraOn ? "on" : "off"}`}
                style={StyleSheet.absoluteFill}
                objectFit="cover"
                mirror={mirrorLocalVideo}
                muted
                onDoubleTap={flipCamera}
                onSingleTap={toggleCallControls}
              />
            </View>
            <LinearGradient
              colors={["rgba(0,0,0,0.4)", "transparent", "transparent", "rgba(0,0,0,0.5)"]}
              locations={[0, 0.25, 0.7, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
        ) : !screenShareStream ? (
          /* === Audio-only / no-video fallback === */
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show or hide call controls"
            onPress={toggleCallControls}
            style={styles.audioCenter}
          >
            <View style={styles.ringingAvatarWrap}>
              {isRinging ? <PulseRing /> : null}
              <CallAvatar
                participant={primaryAvatar}
                size={showLocalVideo && hasRemoteParticipant ? 152 : 120}
              />
            </View>
            <Text style={styles.audioName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.audioStatus}>
              {statusText(call, elapsedSeconds)}
            </Text>
          </Pressable>
        ) : null}

        {/* === Header info bar === */}
        {controlsVisible || call.status !== "active" || isAnyScreenShareActive ? (
          <SafeAreaView
            style={styles.headerSafeArea}
            edges={["top", "left", "right"]}
            pointerEvents="box-none"
          >
            <View style={styles.headerRow} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Minimize call"
                onPress={() => setIsMinimized(true)}
                style={styles.headerButton}
              >
                <Feather name="chevron-down" size={22} color="#fff" />
              </Pressable>
              <View style={styles.headerCenter} pointerEvents="none">
                {(showRemoteVideo || showVideoGrid) ? (
                  <>
                    <Text numberOfLines={1} style={styles.headerName}>
                      {displayName}
                    </Text>
                    <View style={styles.statusRow}>
                      <View
                        style={[
                          styles.statusDot,
                          call.status === "active"
                            ? styles.statusDotActive
                            : styles.statusDotConnecting,
                        ]}
                      />
                      <Text style={styles.headerStatus}>
                        {statusText(call, elapsedSeconds)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
              <View style={styles.headerButton} />
            </View>
          </SafeAreaView>
        ) : null}

        {/* === Local video PiP (1-to-1 with remote) === */}
        {localStream &&
        isVideo &&
        !screenShareStream &&
        !showVideoGrid &&
        (showRemoteVideo || (showLocalVideo && hasRemoteParticipant)) ? (
          <View style={styles.localVideoPreview}>
            {showLocalVideo ? (
              <DoubleTapCallVideo
                stream={localStream}
                key={`${localStream.id}-${isCameraOn ? "on" : "off"}`}
                style={styles.localVideo}
                objectFit="cover"
                mirror={mirrorLocalVideo}
                muted
                zOrder={1}
                onDoubleTap={flipCamera}
                onSingleTap={toggleCallControls}
              />
            ) : (
              <View style={styles.localAvatarPreview}>
                <CallAvatar participant={localAvatar} size={52} />
              </View>
            )}
          </View>
        ) : null}

        {/* === Controls dock === */}
        {controlsVisible ||
        isIncoming ||
        call.status !== "active" ||
        isAnyScreenShareActive ? (
        <SafeAreaView
          style={styles.controlsSafeArea}
          edges={["bottom"]}
          pointerEvents="box-none"
        >
          {isIncoming ? (
            /* Incoming call: decline + accept */
            <View style={styles.incomingControls}>
              <View style={styles.incomingButtonWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decline call"
                  onPress={() => void declineCall()}
                  className="h-14 w-14 items-center justify-center rounded-full"
                  style={({ pressed }) => [
                    styles.controlCircle,
                    styles.declineButton,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Feather name="phone-off" size={26} color="#fff" />
                </Pressable>
                <Text style={styles.controlLabel}>Decline</Text>
              </View>
              <View style={styles.incomingButtonWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Accept call"
                  onPress={() => void acceptCall()}
                  className="h-14 w-14 items-center justify-center rounded-full"
                  style={({ pressed }) => [
                    styles.controlCircle,
                    styles.acceptButton,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Feather name="phone" size={26} color="#fff" />
                </Pressable>
                <Text style={styles.controlLabel}>Accept</Text>
              </View>
            </View>
          ) : (
            /* Active / outgoing call controls */
            <View style={styles.controlDock}>
              <View style={styles.controlRow}>
                {localStream ? (
                  <>
                    <ControlButton
                      icon={isMuted ? "mic-off" : "mic"}
                      label={isMuted ? "Unmute" : "Mute"}
                      active={isMuted}
                      onPress={toggleMute}
                      onInteract={revealControls}
                    />
                    {Platform.OS !== "web" ? (
                      <ControlButton
                        icon={isSpeakerOn ? "volume-2" : "volume-1"}
                        label="Speaker"
                        active={isSpeakerOn}
                        onPress={toggleSpeaker}
                        onInteract={revealControls}
                      />
                    ) : null}
                    {canShareScreen ? (
                      <ControlButton
                        icon={isSharingScreen ? "monitor" : "airplay"}
                        label={isSharingScreen ? "Stop share" : "Share screen"}
                        active={isSharingScreen}
                        onPress={() => void toggleScreenShare()}
                        disabled={isCameraBusy}
                        loading={isCameraBusy}
                        onInteract={revealControls}
                      />
                    ) : null}
                    <ControlButton
                      icon={isCameraOn ? "video" : "video-off"}
                      label="Camera"
                      active={!isCameraOn}
                      onPress={() => void toggleVideo()}
                      disabled={isCameraBusy}
                      loading={isCameraBusy}
                      onInteract={revealControls}
                    />
                    <ControlButton
                      icon={moreControlsVisible ? "x" : "more-horizontal"}
                      label={moreControlsVisible ? "Less" : "More"}
                      active={moreControlsVisible}
                      onPress={() =>
                        setMoreControlsVisible((visible) => !visible)
                      }
                      onInteract={revealControls}
                    />
                  </>
                ) : null}
              </View>
              {moreControlsVisible && localStream ? (
                <View style={styles.secondaryControlRow}>
                  {hasLocalVideoTrack && call.callType === "video" ? (
                    <ControlButton
                      icon="refresh-cw"
                      label="Flip"
                      onPress={() => {
                        setMoreControlsVisible(false);
                        void flipCamera();
                      }}
                      disabled={isCameraBusy}
                      loading={isCameraBusy}
                      onInteract={revealControls}
                    />
                  ) : null}
                  <ControlButton
                    icon="message-circle"
                    label="Chat"
                    onPress={() => {
                      if (
                        !Number.isSafeInteger(call.conversationId) ||
                        call.conversationId <= 0
                      ) {
                        Toast.show({
                          type: "error",
                          text1: "Chat is unavailable",
                          text2: "This call has no valid conversation.",
                        });
                        return;
                      }
                      pendingChatConversationId.current = call.conversationId;
                      setIsMinimized(true);
                    }}
                    onInteract={revealControls}
                  />
                  <ControlButton
                    icon="edit-3"
                    label="Board"
                    onPress={() => {
                      setMoreControlsVisible(false);
                      setIsWhiteboardVisible(true);
                    }}
                    onInteract={revealControls}
                  />
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="End call"
                onPress={() => void endCall()}
                className="min-h-14 flex-row items-center justify-center gap-2 rounded-full bg-red-600 px-8 py-3.5"
                style={({ pressed }) => [
                  styles.endCallButton,
                  pressed && styles.controlPressed,
                ]}
              >
                <Feather name="phone-off" size={22} color="#fff" />
                <Text className="text-[15px] font-bold text-white">End</Text>
              </Pressable>
            </View>
          )}
        </SafeAreaView>
          ) : null}

        <CallWhiteboard
          callId={call.callId}
          visible={isWhiteboardVisible}
          onClose={() => setIsWhiteboardVisible(false)}
        />
      </View>
    </Modal>
  );
}

// --- Helpers ---

function statusLabel(call: OngoingCall) {
  switch (call.status) {
    case "outgoing":
      return "Ringing";
    case "incoming":
      return "Incoming";
    case "connecting":
      return "Connecting";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    case "failed":
      return "Failed";
    default:
      return "";
  }
}

function statusText(call: OngoingCall, elapsedSeconds: number) {
  switch (call.status) {
    case "outgoing":
      return "Ringing…";
    case "incoming":
      return `Incoming ${call.callType} call`;
    case "connecting":
      return "Connecting…";
    case "active": {
      const count = call.participantIds.length + 1;
      return count > 2
        ? `${count} participants · ${formatElapsedTime(elapsedSeconds)}`
        : formatElapsedTime(elapsedSeconds);
    }
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

function RemoteCallVideo({
  stream,
  style,
  onAspectRatioChange,
}: Pick<CallVideoProps, "stream" | "style"> & {
  onAspectRatioChange?: (aspectRatio: number) => void;
}) {
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  const [objectFit, setObjectFit] = useState<"cover" | "contain">(
    settings?.width &&
      settings.height &&
      settings.width >= settings.height * 1.25
      ? "contain"
      : "cover",
  );
  const onDimensionsChange = useCallback(
    ({ width, height }: { width: number; height: number }) => {
      if (width > 0 && height > 0) onAspectRatioChange?.(width / height);
      if (width >= height * 1.25) setObjectFit("contain");
    },
    [onAspectRatioChange],
  );

  return (
    <CallVideo
      stream={stream}
      style={style}
      objectFit={objectFit}
      onDimensionsChange={onDimensionsChange}
    />
  );
}

// --- Reusable sub-components ---

function DoubleTapCallVideo({
  onDoubleTap,
  onSingleTap,
  ...videoProps
}: CallVideoProps & {
  onDoubleTap: () => void;
  onSingleTap?: () => void;
}) {
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
      onSingleTap?.();
    }, 300);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tap to show controls; double tap to switch camera"
      onPress={handlePress}
      style={StyleSheet.absoluteFill}
    >
      <CallVideo {...videoProps} style={StyleSheet.absoluteFill} />
    </Pressable>
  );
}

function CallAvatar({
  participant,
  size,
}: {
  participant: CallAvatarData;
  size: number;
}) {
  return (
    <Avatar
      username={participant.username}
      avatarUrl={participant.avatarUrl ?? undefined}
      localAvatarUrlPath={participant.localAvatarUrlPath}
      size={size}
      ringColor="#0B0F10"
    />
  );
}

function ControlButton({
  icon,
  label,
  active = false,
  disabled = false,
  loading = false,
  onInteract,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  active?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onInteract?: () => void;
  onPress: () => void;
}) {
  return (
    <View style={styles.controlButtonWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, selected: active }}
        onPress={() => {
          onInteract?.();
          onPress();
        }}
        disabled={disabled}
        className="h-14 w-14 items-center justify-center rounded-full"
        style={({ pressed }) => [
          active ? styles.controlActive : styles.controlInactive,
          disabled && styles.controlDisabled,
          pressed && styles.controlPressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name={icon} size={22} color="#fff" />
        )}
      </Pressable>
      <Text className="text-center text-[11px] font-semibold text-white/80">
        {label}
      </Text>
    </View>
  );
}

// --- Styles ---

const CONTROL_SIZE = 54;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F10",
  },

  // Audio-only center layout
  audioCenter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    gap: 14,
  },
  singleVideoStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingTop: 80,
    paddingBottom: 130,
  },
  singleVideoFrame: {
    alignSelf: "center",
    aspectRatio: 16 / 9,
    backgroundColor: "#11181C",
    borderRadius: 16,
    maxHeight: Platform.OS === "web" ? "100%" : "78%",
    maxWidth: Platform.OS === "web" ? 1200 : 480,
    overflow: "hidden",
    width: "100%",
  },
  ringingAvatarWrap: {
    alignItems: "center",
    height: 160,
    justifyContent: "center",
    width: 160,
  },
  audioName: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 8,
    maxWidth: "80%",
    textAlign: "center",
  },
  audioStatus: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontWeight: "500",
  },

  // Header
  headerSafeArea: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 10 },
    }),
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  headerButton: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  headerName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 2,
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusDotActive: {
    backgroundColor: "#22C55E",
  },
  statusDotConnecting: {
    backgroundColor: "#F59E0B",
  },
  headerStatus: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    fontWeight: "500",
  },

  // Local video PiP
  localVideoPreview: {
    backgroundColor: "#111",
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 180,
    overflow: "hidden",
    position: "absolute",
    right: 14,
    top: 100,
    width: 120,
    zIndex: 4,
    ...Platform.select({
      android: {
        elevation: 4,
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
    }),
  },
  localVideo: {
    flex: 1,
  },
  localAvatarPreview: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#1A2028",
  },

  // Controls safe area
  controlsSafeArea: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 10,
    ...Platform.select({
      android: { elevation: 10 },
    }),
  },

  // Active call control dock
  controlDock: {
    alignItems: "center",
    alignSelf: "center",
    gap: 14,
    marginBottom: 12,
    maxWidth: 440,
    paddingHorizontal: 12,
    width: "100%",
  },
  controlRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(15, 20, 25, 0.85)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  secondaryControlRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(15, 20, 25, 0.92)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  controlButtonWrap: {
    alignItems: "center",
    gap: 6,
    minWidth: 62,
  },
  controlCircle: {
    alignItems: "center",
    borderRadius: CONTROL_SIZE / 2,
    height: CONTROL_SIZE,
    justifyContent: "center",
    width: CONTROL_SIZE,
  },
  controlInactive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  controlActive: {
    backgroundColor: "rgba(220, 50, 60, 0.85)",
  },
  controlDisabled: {
    opacity: 0.4,
  },
  controlPressed: {
    opacity: 0.6,
  },
  controlLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  endCallButton: {
    alignItems: "center",
    backgroundColor: "#DC2626",
    borderRadius: 28,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  endCallText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  // Incoming call controls
  incomingControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 50,
    justifyContent: "center",
    marginBottom: 32,
  },
  incomingButtonWrap: {
    alignItems: "center",
    gap: 10,
  },
  declineButton: {
    backgroundColor: "#DC2626",
  },
  acceptButton: {
    backgroundColor: "#16A34A",
  },

  // Video grid
  screenShareStage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    paddingBottom: 152,
    paddingHorizontal: 12,
    paddingTop: 78,
  },
  screenShareStageWithRail: {
    paddingBottom: 272,
  },
  screenShareParticipantRail: {
    bottom: 190,
    height: 94,
    left: 0,
    position: "absolute",
    right: 0,
  },
  screenShareParticipantContent: {
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  screenShareParticipantTile: {
    aspectRatio: 16 / 9,
    backgroundColor: "#11181C",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    height: 82,
    overflow: "hidden",
    width: 146,
  },
  videoGrid: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 80,
    paddingBottom: 130,
  },
  videoGridContent: {
    alignContent: "center",
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignSelf: "center",
    maxWidth: 1120,
    paddingHorizontal: 6,
    width: "100%",
  },
  participantTile: {
    backgroundColor: "#11181C",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: "46%",
    flexGrow: 1,
    margin: 3,
    overflow: "hidden",
    aspectRatio: 16 / 9,
    maxHeight: 360,
    maxWidth: 500,
    minWidth: 145,
  },
  wideParticipantTile: {
    flexBasis: "31%",
    maxWidth: 350,
  },
  gridAvatar: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  tileBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(10, 15, 18, 0.75)",
    borderRadius: 10,
    bottom: 8,
    left: 8,
    maxWidth: "80%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
  },
  tileBadgeName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  // Minimized call bar
  minimizedCall: {
    alignItems: "center",
    backgroundColor: "#142126",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    maxWidth: "90%",
    position: "absolute",
    right: 12,
    zIndex: 100,
    minHeight: 56,
    width: 280,
    ...Platform.select({
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
    }),
  },
  minimizedIconWrap: {
    alignItems: "center",
    backgroundColor: BRAND_COLOR,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  minimizedIconActive: {
    backgroundColor: "#16A34A",
  },
});

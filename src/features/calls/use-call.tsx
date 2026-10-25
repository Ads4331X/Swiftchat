import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Toast from "react-native-toast-message";
import type { MediaStream } from "react-native-webrtc";

import { api } from "@/core/api";
import { getUser } from "@/core/db";

import {
  acceptIncomingCall,
  createOutgoingOffer,
  endCall as signalEndCall,
  handleCallAnswer,
  handleIncomingIce,
  handleIncomingOffer,
  handleParticipantLeft as closeCallParticipant,
  prepareCall,
  renegotiateCallVideo,
  rejectIncomingCall,
  setupCallListeners,
  startCall as signalStartCall,
} from "./call-manager";
import {
  closeAllPeerConnections,
  getLocalVideoMedia,
  hasTurnCredentials,
  requestPermissions,
  setCallSpeakerphone,
  stopCallAudio,
  stopLocalMedia,
  switchCamera,
  toggleCamera,
  toggleMicrophone,
} from "./webrtc";
import type { CallType, OngoingCall } from "./types";

type IncomingCallData = {
  callId: string;
  conversationId: number;
  callerId: number;
  callType: CallType;
  participantCount: number;
};

type StartCallArgs = {
  callType: CallType;
  conversationId: number;
  participantId: number;
  participantName?: string;
};

type CallContextValue = {
  call: OngoingCall | null;
  localStream: MediaStream | null;
  remoteStreams: { participantId: number; stream: MediaStream }[];
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOn: boolean;
  isCameraBusy: boolean;
  startCall: (args: StartCallArgs) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => Promise<void>;
  flipCamera: () => Promise<void>;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [call, setCall] = useState<OngoingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    { participantId: number; stream: MediaStream }[]
  >([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isCameraBusy, setIsCameraBusy] = useState(false);

  const callRef = useRef<OngoingCall | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraOperationRef = useRef(false);

  const commitCall = useCallback((next: OngoingCall | null) => {
    callRef.current = next;
    setCall(next);
  }, []);

  const patchCall = useCallback((patch: Partial<OngoingCall>) => {
    const current = callRef.current;
    if (!current) return;

    const next = { ...current, ...patch };
    callRef.current = next;
    setCall(next);
  }, []);

  const commitLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
  }, []);

  const resetCall = useCallback(() => {
    if (!callRef.current && !localStreamRef.current) return;

    const stream = localStreamRef.current;

    if (stream) {
      void stopLocalMedia({ stream });
    }

    try {
      closeAllPeerConnections();
    } finally {
      void stopCallAudio();
      commitLocalStream(null);
      setRemoteStreams([]);
      setIsMuted(false);
      setIsSpeakerOn(false);
      setIsCameraOn(true);
      commitCall(null);
    }
  }, [commitCall, commitLocalStream]);

  const finishCall = useCallback(async () => {
    const current = callRef.current;

    if (current) {
      try {
        await signalEndCall({ callId: current.callId });
      } catch (err) {
        console.warn("Failed to signal call end:", err);
      }
    }

    resetCall();
  }, [resetCall]);

  const handleRemoteStream = useCallback(
    (participantId: number, stream: MediaStream) => {
      setRemoteStreams((current) => {
        const existing = current.findIndex(
          (entry) => entry.participantId === participantId,
        );
        if (existing < 0) return [...current, { participantId, stream }];
        const next = [...current];
        next[existing] = { participantId, stream };
        return next;
      });
    },
    [],
  );

  const handleConnectionStateChange = useCallback(
    (
      state: RTCPeerConnectionState,
      iceState: RTCIceConnectionState,
      participantId: number,
    ) => {
      if (state === "connected") {
        const current = callRef.current;
        patchCall({
          status: "active",
          connectedAt: current?.connectedAt ?? Date.now(),
        });
        return;
      }

      if (state === "connecting") {
        const current = callRef.current;
        if (current?.status !== "active") patchCall({ status: "connecting" });
        return;
      }

      if (state === "failed") {
        const current = callRef.current;
        if (current && current.participantCount > 2) {
          closeCallParticipant({ participantId });
          setRemoteStreams((entries) =>
            entries.filter((entry) => entry.participantId !== participantId),
          );
          patchCall({
            participantIds: current.participantIds.filter(
              (id) => id !== participantId,
            ),
          });
          Toast.show({
            type: "error",
            text1: "Participant connection failed",
            text2: hasTurnCredentials()
              ? `Connection to participant ${participantId} failed.`
              : "Check TURN configuration and network access.",
          });
          return;
        }

        const connectionHelp = hasTurnCredentials()
          ? `ICE connection failed (${iceState}). Check the network or TURN relay availability.`
          : "TURN relay credentials are missing. Configure EXPO_PUBLIC_TURN_USERNAME and EXPO_PUBLIC_TURN_CREDENTIAL, then restart Metro.";
        Toast.show({
          type: "error",
          text1: "Call failed",
          text2: connectionHelp,
        });
        void finishCall();
      }
    },
    [finishCall, patchCall],
  );

  const handleIncoming = useCallback(
    (data: IncomingCallData) => {
      if (callRef.current) {
        void rejectIncomingCall({ callId: data.callId }).catch(() => {});
        Toast.show({
          type: "info",
          text1: "Incoming call declined",
          text2: "You are already on another call.",
        });
        return;
      }

      setIsMuted(false);
      setIsSpeakerOn(data.callType === "video");
      setIsCameraOn(data.callType === "video");
      commitCall({
        callId: data.callId,
        callType: data.callType,
        conversationId: data.conversationId,
        participantId: data.callerId,
        participantName: "Incoming call",
        direction: "incoming",
        status: "incoming",
        participantIds: [data.callerId],
        participantCount: data.participantCount,
      });

      void (async () => {
        let name = "";

        try {
          const cached = await getUser(data.callerId);

          if (cached?.username) {
            name = cached.username;
          } else {
            const response = await api.get(`/api/user/${data.callerId}`);
            name = response.data?.username ?? "";
          }
        } catch {
          // Name lookup is best-effort; the call must not wait on it.
        }

        if (name && callRef.current?.callId === data.callId) {
          patchCall({ participantName: name });
        }
      })();
    },
    [commitCall, patchCall],
  );

  const startCall = useCallback(
    async ({
      callType,
      conversationId,
      participantId,
      participantName,
    }: StartCallArgs) => {
      if (callRef.current) {
        throw new Error("You are already on a call.");
      }

      const stream = await prepareCall({ callType });
      let callId: string;
      let participantCount: number;
      try {
        const result = await signalStartCall({ callType, conversationId });
        callId = result.callId;
        participantCount = result.participantCount;
      } catch (err) {
        await stopLocalMedia({ stream });
        await stopCallAudio();
        throw err;
      }

      setIsMuted(false);
      setIsSpeakerOn(callType === "video");
      setIsCameraOn(
        stream.getVideoTracks().some((track) => track.enabled),
      );
      commitLocalStream(stream);
      commitCall({
        callId,
        callType,
        conversationId,
        participantId,
        participantName: participantName ?? "Unknown",
        direction: "outgoing",
        status: "outgoing",
        participantIds: [],
        participantCount,
      });
    },
    [commitCall, commitLocalStream],
  );

  const acceptCall = useCallback(async () => {
    const current = callRef.current;

    if (
      !current ||
      current.direction !== "incoming" ||
      current.status !== "incoming"
    ) {
      return;
    }

    let stream: MediaStream | undefined;
    try {
      stream = await prepareCall({ callType: current.callType });
      commitLocalStream(stream);
      setIsCameraOn(stream.getVideoTracks().some((track) => track.enabled));
      patchCall({ status: "connecting" });
      await acceptIncomingCall({ callId: current.callId });
    } catch (err) {
      if (stream) {
        await stopLocalMedia({ stream });
        commitLocalStream(null);
      }
      await rejectIncomingCall({ callId: current.callId }).catch(() => {});
      resetCall();
      Toast.show({
        type: "error",
        text1: "Could not accept call",
        text2: err instanceof Error ? err.message : "Please try again.",
      });
    }
  }, [
    commitLocalStream,
    patchCall,
    resetCall,
  ]);

  const declineCall = useCallback(async () => {
    const current = callRef.current;

    if (!current) return;

    try {
      await rejectIncomingCall({ callId: current.callId });
    } catch (err) {
      console.warn("Failed to decline call:", err);
    }

    resetCall();
  }, [resetCall]);

  const handleAccepted = useCallback(
    async ({
      callId,
      userId,
      peerIds,
      offerPeerIds,
    }: {
      callId: string;
      userId: number;
      peerIds: number[];
      offerPeerIds: number[];
    }) => {
      const current = callRef.current;

      if (!current || current.callId !== callId) return;

      const participantIds = new Set(current.participantIds);
      peerIds.forEach((peerId) => participantIds.add(peerId));
      patchCall({
        status: current.status === "active" ? "active" : "connecting",
        participantIds: [...participantIds],
      });

      const stream = localStreamRef.current;
      if (!stream) {
        Toast.show({
          type: "error",
          text1: "Call media is not ready",
          text2: "Please leave the call and try again.",
        });
        return;
      }

      await Promise.all(
        offerPeerIds.map(async (participantId) => {
          try {
            await createOutgoingOffer({
              callType: current.callType,
              participantId,
              callId,
              localStream: stream,
              onRemoteStream: handleRemoteStream,
              onConnectionStateChange: handleConnectionStateChange,
            });
          } catch (err) {
            Toast.show({
              type: "error",
              text1: "Could not connect a participant",
              text2:
                err instanceof Error ? err.message : "Please try again.",
            });
            setRemoteStreams((entries) =>
              entries.filter((entry) => entry.participantId !== participantId),
            );
            patchCall({
              participantIds: callRef.current?.participantIds.filter(
                (id) => id !== participantId,
              ),
            });
          }
        }),
      );
    },
    [
      handleConnectionStateChange,
      handleRemoteStream,
      patchCall,
    ],
  );

  const handleOffer = useCallback(
    async (data: {
      callId: string;
      senderId: number;
      offer: RTCSessionDescriptionInit;
      callType: CallType;
    }) => {
      const current = callRef.current;

      if (!current || current.callId !== data.callId) return;

      if (current.status !== "active") {
        patchCall({ status: "connecting" });
      }

      try {
        const { stream } = await handleIncomingOffer({
          callId: data.callId,
          senderId: data.senderId,
          callType: data.callType,
          offer: data.offer,
          localStream: localStreamRef.current ?? undefined,
          onRemoteStream: handleRemoteStream,
          onConnectionStateChange: handleConnectionStateChange,
        });

        if (callRef.current?.callId !== data.callId) {
          void stopLocalMedia({ stream });
          return;
        }

        if (!localStreamRef.current) {
          commitLocalStream(stream);
          setIsCameraOn(stream.getVideoTracks().some((track) => track.enabled));
        }
      } catch (err) {
        closeCallParticipant({ participantId: data.senderId });
        setRemoteStreams((entries) =>
          entries.filter((entry) => entry.participantId !== data.senderId),
        );
        patchCall({
          participantIds: callRef.current?.participantIds.filter(
            (id) => id !== data.senderId,
          ),
        });
        Toast.show({
          type: "error",
          text1: "Could not connect participant",
          text2: err instanceof Error ? err.message : "Please try again.",
        });
        if (current.participantCount <= 2) await finishCall();
      }
    },
    [
      commitLocalStream,
      finishCall,
      handleConnectionStateChange,
      handleRemoteStream,
      patchCall,
    ],
  );

  const handleAnswer = useCallback(
    async (data: {
      callId: string;
      senderId: number;
      answer: RTCSessionDescriptionInit;
    }) => {
      const current = callRef.current;

      if (!current || current.callId !== data.callId) return;

      try {
        await handleCallAnswer({
          participantId: data.senderId,
          answer: data.answer,
        });
      } catch (err) {
        closeCallParticipant({ participantId: data.senderId });
        Toast.show({
          type: "error",
          text1: "Could not connect participant",
          text2: err instanceof Error ? err.message : "Please try again.",
        });
        if (current.participantCount <= 2) await finishCall();
      }
    },
    [finishCall],
  );

  const handleIce = useCallback(
    async (data: {
      callId: string;
      senderId: number;
      candidate: RTCIceCandidateInit;
    }) => {
      const current = callRef.current;

      if (!current || current.callId !== data.callId) return;

      try {
        await handleIncomingIce({
          senderId: data.senderId,
          candidate: data.candidate,
        });
      } catch (err) {
        console.warn("Failed to add ICE candidate:", err);
      }
    },
    [],
  );

  const handleDeclined = useCallback(
    ({ callId, userId }: { callId: string; userId: number }) => {
      const current = callRef.current;

      if (!current || current.callId !== callId) return;

      if (current.participantCount > 2) {
        closeCallParticipant({ participantId: userId });
        setRemoteStreams((entries) =>
          entries.filter((entry) => entry.participantId !== userId),
        );
        patchCall({
          participantIds: current.participantIds.filter(
            (participantId) => participantId !== userId,
          ),
        });
        Toast.show({
          type: "info",
          text1: "Participant declined",
          text2: "The group call can continue.",
        });
        return;
      }

      Toast.show({
        type: "info",
        text1: "Call declined",
        text2: "The call was declined.",
      });
      resetCall();
    },
    [patchCall, resetCall],
  );

  const handleEnded = useCallback(
    ({ callId }: { callId: string; userId: number }) => {
      const current = callRef.current;

      if (!current || current.callId !== callId) return;

      Toast.show({ type: "info", text1: "Call ended" });
      resetCall();
    },
    [resetCall],
  );

  const handleParticipantLeft = useCallback(
    ({ callId, userId }: { callId: string; userId: number }) => {
      if (callRef.current?.callId !== callId) return;
      closeCallParticipant({ participantId: userId });
      setRemoteStreams((entries) =>
        entries.filter((entry) => entry.participantId !== userId),
      );
      patchCall({
        participantIds: callRef.current.participantIds.filter(
          (participantId) => participantId !== userId,
        ),
      });
    },
    [patchCall],
  );

  useEffect(() => {
    return setupCallListeners({
      onIncoming: handleIncoming,
      onAccepted: handleAccepted,
      onDeclined: handleDeclined,
      onEnded: handleEnded,
      onParticipantLeft: handleParticipantLeft,
      onOffer: handleOffer,
      onAnswer: handleAnswer,
      onIce: handleIce,
    });
  }, [
    handleAccepted,
    handleAnswer,
    handleDeclined,
    handleEnded,
    handleParticipantLeft,
    handleIce,
    handleIncoming,
    handleOffer,
  ]);

  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        void stopLocalMedia({ stream: localStreamRef.current });
      }
      closeAllPeerConnections();
    };
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;

    if (!stream) return;

    const enabled = toggleMicrophone({ stream });
    setIsMuted(!enabled);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const enabled = !isSpeakerOn;
    try {
      setCallSpeakerphone(enabled);
      setIsSpeakerOn(enabled);
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Could not change audio output",
        text2: err instanceof Error ? err.message : "Please try again.",
      });
    }
  }, [isSpeakerOn]);

  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (stream.getVideoTracks().length > 0) {
      const enabled = toggleCamera({ stream });
      setIsCameraOn(enabled);
      return;
    }

    const currentCall = callRef.current;
    if (!currentCall || cameraOperationRef.current) return;

    cameraOperationRef.current = true;
    setIsCameraBusy(true);
    let captureStream: MediaStream | null = null;
    let videoTrack: ReturnType<MediaStream["getVideoTracks"]>[number] | undefined;
    let addedToCallStream = false;

    try {
      const granted = await requestPermissions({ callType: "video" });
      if (!granted) {
        throw new Error("Camera permission denied.");
      }
      if (
        callRef.current?.callId !== currentCall.callId ||
        localStreamRef.current !== stream
      ) {
        return;
      }

      captureStream = await getLocalVideoMedia();
      if (
        callRef.current?.callId !== currentCall.callId ||
        localStreamRef.current !== stream
      ) {
        captureStream.getTracks().forEach((track) => track.stop());
        return;
      }

      videoTrack = captureStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error("No camera is available on this device.");
      }

      for (const audioTrack of captureStream.getAudioTracks()) {
        audioTrack.stop();
      }

      videoTrack.enabled = true;
      stream.addTrack(videoTrack);
      captureStream.removeTrack(videoTrack);
      addedToCallStream = true;

      await renegotiateCallVideo({
        callId: currentCall.callId,
        participantIds: currentCall.participantIds,
        localStream: stream,
      });
      if (callRef.current?.callId !== currentCall.callId) {
        await stopLocalMedia({ stream });
        return;
      }
      setIsCameraOn(true);
    } catch (err) {
      if (!addedToCallStream && videoTrack) {
        videoTrack.stop();
      }
      if (addedToCallStream) {
        setIsCameraOn(true);
      }
      Toast.show({
        type: "error",
        text1: "Could not enable camera",
        text2: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      cameraOperationRef.current = false;
      setIsCameraBusy(false);
    }
  }, []);

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    const callId = callRef.current?.callId;
    if (!stream || !callId || cameraOperationRef.current) return;

    cameraOperationRef.current = true;
    setIsCameraBusy(true);
    try {
      await switchCamera({ stream });
      if (callRef.current?.callId !== callId) {
        await stopLocalMedia({ stream });
      }
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Could not switch camera",
        text2: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      cameraOperationRef.current = false;
      setIsCameraBusy(false);
    }
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      call,
      localStream,
      remoteStreams,
      isMuted,
      isSpeakerOn,
      isCameraOn,
      isCameraBusy,
      startCall,
      acceptCall,
      declineCall,
      endCall: finishCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
      flipCamera,
    }),
    [
      acceptCall,
      call,
      declineCall,
      finishCall,
      isCameraOn,
      isCameraBusy,
      isMuted,
      isSpeakerOn,
      localStream,
      remoteStreams,
      startCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
      flipCamera,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const context = useContext(CallContext);

  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }

  return context;
}

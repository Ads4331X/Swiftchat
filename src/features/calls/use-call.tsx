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
  rejectIncomingCall,
  setupCallListeners,
  startCall as signalStartCall,
} from "./call-manager";
import {
  closeAllPeerConnections,
  setCallSpeakerphone,
  stopCallAudio,
  stopLocalMedia,
  toggleCamera,
  toggleMicrophone,
} from "./webrtc";
import type { CallType, OngoingCall } from "./types";

type IncomingCallData = {
  callId: string;
  conversationId: number;
  callerId: number;
  callType: CallType;
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
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isCameraOn: boolean;
  startCall: (args: StartCallArgs) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleVideo: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [call, setCall] = useState<OngoingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);

  const callRef = useRef<OngoingCall | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

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
    const stream = localStreamRef.current;

    if (stream) {
      void stopLocalMedia({ stream });
    }

    closeAllPeerConnections();
    void stopCallAudio();
    commitLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsSpeakerOn(false);
    setIsCameraOn(true);
    commitCall(null);
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

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    setRemoteStream(stream);
  }, []);

  const handleConnectionStateChange = useCallback(
    (state: RTCPeerConnectionState) => {
      if (state === "connected") {
        patchCall({ status: "active" });
        return;
      }

      if (state === "connecting") {
        patchCall({ status: "connecting" });
        return;
      }

      if (state === "failed") {
        Toast.show({
          type: "error",
          text1: "Call failed",
          text2: "Could not establish a connection.",
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

      const callId = await signalStartCall({ callType, conversationId });

      setIsMuted(false);
      setIsSpeakerOn(callType === "video");
      setIsCameraOn(callType === "video");
      commitCall({
        callId,
        callType,
        conversationId,
        participantId,
        participantName: participantName ?? "Unknown",
        direction: "outgoing",
        status: "outgoing",
      });
    },
    [commitCall],
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

    patchCall({ status: "connecting" });

    try {
      await acceptIncomingCall({ callId: current.callId });
    } catch (err) {
      Toast.show({
        type: "error",
        text1: "Could not accept call",
        text2: err instanceof Error ? err.message : "Please try again.",
      });
      await finishCall();
    }
  }, [finishCall, patchCall]);

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
    async ({ callId, userId }: { callId: string; userId: number }) => {
      const current = callRef.current;

      if (!current || current.callId !== callId) return;

      patchCall({ status: "connecting", participantId: userId });

      try {
        const { stream } = await createOutgoingOffer({
          callType: current.callType,
          participantId: userId,
          callId,
          onRemoteStream: handleRemoteStream,
          onConnectionStateChange: handleConnectionStateChange,
        });

        if (callRef.current?.callId !== callId) {
          void stopLocalMedia({ stream });
          return;
        }

        commitLocalStream(stream);
        setIsMuted(false);
        setIsSpeakerOn(current.callType === "video");
        setIsCameraOn(current.callType === "video");
      } catch (err) {
        Toast.show({
          type: "error",
          text1: "Call failed",
          text2:
            err instanceof Error ? err.message : "Unable to start the call.",
        });
        await finishCall();
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

  const handleOffer = useCallback(
    async (data: {
      callId: string;
      senderId: number;
      offer: RTCSessionDescriptionInit;
      callType: CallType;
    }) => {
      const current = callRef.current;

      if (!current || current.callId !== data.callId) return;

      patchCall({ status: "connecting" });

      try {
        const { stream } = await handleIncomingOffer({
          callId: data.callId,
          senderId: data.senderId,
          callType: data.callType,
          offer: data.offer,
          onRemoteStream: handleRemoteStream,
          onConnectionStateChange: handleConnectionStateChange,
        });

        if (callRef.current?.callId !== data.callId) {
          void stopLocalMedia({ stream });
          return;
        }

        commitLocalStream(stream);
        setIsMuted(false);
        setIsSpeakerOn(data.callType === "video");
        setIsCameraOn(data.callType === "video");
      } catch (err) {
        Toast.show({
          type: "error",
          text1: "Call failed",
          text2:
            err instanceof Error ? err.message : "Unable to answer the call.",
        });
        await finishCall();
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
      } catch {
        Toast.show({
          type: "error",
          text1: "Call failed",
          text2: "Could not apply the call answer.",
        });
        await finishCall();
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
    ({ callId }: { callId: string; userId: number }) => {
      const current = callRef.current;

      if (!current || current.callId !== callId) return;

      Toast.show({
        type: "info",
        text1: "Call declined",
        text2: "The call was declined.",
      });
      resetCall();
    },
    [resetCall],
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

  useEffect(() => {
    return setupCallListeners({
      onIncoming: handleIncoming,
      onAccepted: handleAccepted,
      onDeclined: handleDeclined,
      onEnded: handleEnded,
      onOffer: handleOffer,
      onAnswer: handleAnswer,
      onIce: handleIce,
    });
  }, [
    handleAccepted,
    handleAnswer,
    handleDeclined,
    handleEnded,
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

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;

    if (!stream) return;

    const enabled = toggleCamera({ stream });
    setIsCameraOn(enabled);
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      call,
      localStream,
      remoteStream,
      isMuted,
      isSpeakerOn,
      isCameraOn,
      startCall,
      acceptCall,
      declineCall,
      endCall: finishCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
    }),
    [
      acceptCall,
      call,
      declineCall,
      finishCall,
      isCameraOn,
      isMuted,
      isSpeakerOn,
      localStream,
      remoteStream,
      startCall,
      toggleMute,
      toggleSpeaker,
      toggleVideo,
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

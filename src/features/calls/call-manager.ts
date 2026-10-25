import {
  acceptCall,
  declineCall,
  initiateCall,
  onIncomingCall,
  endCall as signalEndCall,
  onCallAccepted,
  onCallDeclined,
  onCallEnded,
  onCallParticipantLeft,
  sendCallOffer,
  sendCallAnswer,
  onCallOffer,
  onCallAnswer,
  onIceCandidate,
} from "@/core/socket/call-signaling";
import type { MediaStream } from "react-native-webrtc";
import {
  addIceCandidate,
  addLocalTracks,
  addLocalTracksToPeerConnection,
  closePeerConnection,
  createAnswer,
  createOffer,
  createPeerConnection,
  getLocalMedia,
  handleAnswer,
  requestPermissions,
  startCallAudio,
  stopCallAudio,
  stopLocalMedia,
} from "./webrtc";

type IncomingCall = {
  callId: string;
  conversationId: number;
  callerId: number;
  callType: "audio" | "video";
  participantCount: number;
};

export function setupCallListeners({
  onIncoming,
  onAccepted,
  onDeclined,
  onEnded,
  onParticipantLeft,
  onOffer,
  onAnswer,
  onIce,
}: {
  onIncoming: (call: IncomingCall) => void;
  onAccepted: (data: {
    callId: string;
    userId: number;
    peerIds: number[];
    offerPeerIds: number[];
  }) => void;
  onDeclined: (data: { callId: string; userId: number }) => void;
  onEnded: (data: { callId: string; userId: number }) => void;
  onParticipantLeft: (data: { callId: string; userId: number }) => void;
  onOffer: (data: {
    callId: string;
    senderId: number;
    offer: RTCSessionDescriptionInit;
    callType: "audio" | "video";
  }) => void;
  onAnswer: (data: {
    callId: string;
    senderId: number;
    answer: RTCSessionDescriptionInit;
  }) => void;
  onIce: (data: {
    callId: string;
    senderId: number;
    candidate: RTCIceCandidateInit;
  }) => void;
}) {
  const unsubscribeIncoming = onIncomingCall(onIncoming);
  const unsubscribeAccepted = onCallAccepted(onAccepted);
  const unsubscribeDeclined = onCallDeclined(onDeclined);
  const unsubscribeEnded = onCallEnded(onEnded);
  const unsubscribeParticipantLeft = onCallParticipantLeft(onParticipantLeft);
  const unsubscribeOffer = onCallOffer(onOffer);
  const unsubscribeAnswer = onCallAnswer(onAnswer);
  const unsubscribeIce = onIceCandidate(onIce);

  return () => {
    unsubscribeIncoming?.();
    unsubscribeAccepted?.();
    unsubscribeDeclined?.();
    unsubscribeEnded?.();
    unsubscribeParticipantLeft?.();
    unsubscribeOffer?.();
    unsubscribeAnswer?.();
    unsubscribeIce?.();
  };
}

export async function startCall({
  callType,
  conversationId,
}: {
  callType: "audio" | "video";
  conversationId: number;
}) {
  return initiateCall({ conversationId, callType });
}

export async function acceptIncomingCall({
  callId,
}: {
  callId: string;
}): Promise<void> {
  await acceptCall({ callId });
}

export async function rejectIncomingCall({
  callId,
}: {
  callId: string;
}): Promise<void> {
  await declineCall({ callId });
}

export async function endCall({ callId }: { callId: string }): Promise<void> {
  await signalEndCall({ callId });
}

export async function prepareCall({
  callType,
}: {
  callType: "audio" | "video";
}) {
  const granted = await requestPermissions({ callType });

  if (!granted) {
    throw new Error("Microphone or camera permission denied");
  }

  await startCallAudio({ callType });

  try {
    const stream = await getLocalMedia({ callType });

    if (!stream) {
      throw new Error("Failed to access microphone or camera");
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(
        "No microphone track was created. Check microphone permission and try again.",
      );
    }

    return stream;
  } catch (err) {
    await stopCallAudio();
    throw err;
  }
}

export async function setupOutgoingCall({
  callType,
  participantId,
  callId,
  localStream,
  onRemoteStream,
  onConnectionStateChange,
}: {
  callType: "audio" | "video";
  participantId: number;
  callId: string;
  localStream?: MediaStream;
  onRemoteStream: (participantId: number, stream: MediaStream) => void;
  onConnectionStateChange: (
    state: RTCPeerConnectionState,
    iceState: RTCIceConnectionState,
    participantId: number,
  ) => void;
}) {
  const stream = localStream ?? (await prepareCall({ callType }));

  const peerConnection = createPeerConnection({
    participantId,
    callId,
    onRemoteStream,
    onConnectionStateChange,
  });

  if (!peerConnection) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Failed to create peer connection");
  }

  await addLocalTracks({ stream, peerConnection });

  return { stream, peerConnection };
}

export async function createOutgoingOffer({
  callType,
  participantId,
  callId,
  localStream,
  onRemoteStream,
  onConnectionStateChange,
}: {
  callType: "audio" | "video";
  participantId: number;
  callId: string;
  localStream?: MediaStream;
  onRemoteStream: (participantId: number, stream: MediaStream) => void;
  onConnectionStateChange: (
    state: RTCPeerConnectionState,
    iceState: RTCIceConnectionState,
    participantId: number,
  ) => void;
}) {
  const ownsStream = !localStream;
  let stream: MediaStream | undefined;

  try {
    ({ stream } = await setupOutgoingCall({
      callType,
      participantId,
      callId,
      localStream,
      onRemoteStream,
      onConnectionStateChange,
    }));

    const offer = await createOffer({ participantId });

    if (!offer) {
      throw new Error("Failed to create call offer");
    }

    await sendCallOffer({
      callId,
      receiverId: participantId,
      offer,
    });

    return { stream, offer };
  } catch (err) {
    closePeerConnection({ participantId });
    if (ownsStream && stream) await stopLocalMedia({ stream });
    throw err;
  }
}

export async function renegotiateCallVideo({
  callId,
  participantIds,
  localStream,
}: {
  callId: string;
  participantIds: number[];
  localStream: MediaStream;
}) {
  await Promise.all(
    participantIds.map(async (participantId) => {
      await addLocalTracksToPeerConnection({ participantId, stream: localStream });
      const offer = await createOffer({ participantId });
      if (!offer) return;

      await sendCallOffer({
        callId,
        receiverId: participantId,
        offer,
      });
    }),
  );
}

export async function handleCallAnswer({
  participantId,
  answer,
}: {
  participantId: number;
  answer: RTCSessionDescriptionInit;
}) {
  await handleAnswer({ participantId, answer });
}

export async function handleIncomingIce({
  senderId,
  candidate,
}: {
  senderId: number;
  candidate: RTCIceCandidateInit;
}) {
  await addIceCandidate({
    participantId: senderId,
    candidate,
  });
}

export function handleParticipantLeft({ participantId }: { participantId: number }) {
  closePeerConnection({ participantId });
}

export async function handleIncomingOffer({
  callId,
  senderId,
  callType,
  offer,
  localStream,
  onRemoteStream,
  onConnectionStateChange,
}: {
  callId: string;
  senderId: number;
  callType: "audio" | "video";
  offer: RTCSessionDescriptionInit;
  localStream?: MediaStream;
  onRemoteStream: (participantId: number, stream: MediaStream) => void;
  onConnectionStateChange: (
    state: RTCPeerConnectionState,
    iceState: RTCIceConnectionState,
    participantId: number,
  ) => void;
}) {
  const ownsStream = !localStream;
  const stream = localStream ?? (await prepareCall({ callType }));

  const peerConnection = createPeerConnection({
    participantId: senderId,
    callId,
    onRemoteStream,
    onConnectionStateChange,
  });

  if (!peerConnection) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("Failed to create peer connection");
  }

  try {
    await addLocalTracks({ stream, peerConnection });

    const answer = await createAnswer({
      offer,
      participantId: senderId,
    });

    if (!answer) {
      throw new Error("Failed to create call answer");
    }

    await sendCallAnswer({
      callId,
      receiverId: senderId,
      answer,
    });

    return { stream, peerConnection, answer };
  } catch (err) {
    if (ownsStream) await stopLocalMedia({ stream });
    closePeerConnection({ participantId: senderId });
    throw err;
  }
}

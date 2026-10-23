import {
  acceptCall,
  declineCall,
  initiateCall,
  onIncomingCall,
  endCall as signalEndCall,
  onCallAccepted,
  onCallDeclined,
  onCallEnded,
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
  closePeerConnection,
  createAnswer,
  createOffer,
  createPeerConnection,
  getLocalMedia,
  handleAnswer,
  requestPermissions,
  startCallAudio,
  stopLocalMedia,
} from "./webrtc";

type IncomingCall = {
  callId: string;
  conversationId: number;
  callerId: number;
  callType: "audio" | "video";
};

export function setupCallListeners({
  onIncoming,
  onAccepted,
  onDeclined,
  onEnded,
  onOffer,
  onAnswer,
  onIce,
}: {
  onIncoming: (call: IncomingCall) => void;
  onAccepted: (data: { callId: string; userId: number }) => void;
  onDeclined: (data: { callId: string; userId: number }) => void;
  onEnded: (data: { callId: string; userId: number }) => void;
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
  const unsubscribeOffer = onCallOffer(onOffer);
  const unsubscribeAnswer = onCallAnswer(onAnswer);
  const unsubscribeIce = onIceCandidate(onIce);

  return () => {
    unsubscribeIncoming?.();
    unsubscribeAccepted?.();
    unsubscribeDeclined?.();
    unsubscribeEnded?.();
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
  const callId = await initiateCall({ conversationId, callType });
  return callId;
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

  const stream = await getLocalMedia({ callType });

  if (!stream) {
    throw new Error("Failed to access microphone or camera");
  }

  await startCallAudio({ callType });

  return stream;
}

export async function setupOutgoingCall({
  callType,
  participantId,
  callId,
  onRemoteStream,
  onConnectionStateChange,
}: {
  callType: "audio" | "video";
  participantId: number;
  callId: string;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}) {
  const stream = await prepareCall({ callType });

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
  onRemoteStream,
  onConnectionStateChange,
}: {
  callType: "audio" | "video";
  participantId: number;
  callId: string;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}) {
  const { stream } = await setupOutgoingCall({
    callType,
    participantId,
    callId,
    onRemoteStream,
    onConnectionStateChange,
  });

  try {
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
    await stopLocalMedia({ stream });
    closePeerConnection({ participantId });
    throw err;
  }
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

export async function handleIncomingOffer({
  callId,
  senderId,
  callType,
  offer,
  onRemoteStream,
  onConnectionStateChange,
}: {
  callId: string;
  senderId: number;
  callType: "audio" | "video";
  offer: RTCSessionDescriptionInit;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
}) {
  const stream = await prepareCall({ callType });

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
      answer,
    });

    return { stream, peerConnection, answer };
  } catch (err) {
    await stopLocalMedia({ stream });
    closePeerConnection({ participantId: senderId });
    throw err;
  }
}

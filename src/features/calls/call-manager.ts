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
} from "@/core/socket/call-signaling";
import type { MediaStream } from "react-native-webrtc";
import {
  addLocalTracks,
  createOffer,
  createPeerConnection,
  getLocalMedia,
  requestPermissions,
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
}: {
  onIncoming: (call: IncomingCall) => void;
  onAccepted: (data: { callId: string; userId: number }) => void;
  onDeclined: (data: { callId: string; userId: number }) => void;
  onEnded: (data: { callId: string; userId: number }) => void;
}) {
  const unsubscribeIncoming = onIncomingCall(onIncoming);
  const unsubscribeAccepted = onCallAccepted(onAccepted);
  const unsubscribeDeclined = onCallDeclined(onDeclined);
  const unsubscribeEnded = onCallEnded(onEnded);

  return () => {
    unsubscribeIncoming?.();
    unsubscribeAccepted?.();
    unsubscribeDeclined?.();
    unsubscribeEnded?.();
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
  await setupOutgoingCall({
    callType,
    participantId,
    callId,
    onRemoteStream,
    onConnectionStateChange,
  });

  const offer = await createOffer({ participantId });

  if (!offer) {
    throw new Error("Failed to create call offer");
  }

  await sendCallOffer({
    callId,
    receiverId: participantId,
    offer,
  });

  return offer;
}

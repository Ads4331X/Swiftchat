import { connectSocket, getSocket, listenForSocketEvent } from "./client";

type CallType = "audio" | "video";
export type ParticipantCallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "disconnected";

type CallEventData = Record<string, unknown>;

export type CallWhiteboardStroke = {
  id: string;
  color: string;
  points: { x: number; y: number }[];
};

type CallAcknowledgment<T = Record<string, unknown>> = {
  success: boolean;
  data?: T;
  callId?: string;
  error?: string;
};

async function getConnectedSocket() {
  let socket = getSocket();

  if (!socket?.connected) {
    await connectSocket();
    socket = getSocket();
  }

  if (!socket?.connected) {
    throw new Error("Socket is not connected");
  }

  return socket;
}

async function emitCallEvent(
  event: string,
  data: CallEventData,
): Promise<void> {
  const socket = await getConnectedSocket();
  socket.emit(event, data);
}

async function emitCallEventWithAck<T>(
  event: string,
  data: CallEventData,
): Promise<T> {
  const socket = await getConnectedSocket();

  return new Promise<T>((resolve, reject) => {
    socket
      .timeout(10000)
      .emit(
        event,
        data,
        (error: Error | null, response: CallAcknowledgment<T>) => {
          if (error) {
            reject(new Error("Call request timed out"));
            return;
          }

          if (!response?.success) {
            reject(new Error(response?.error ?? "Call request failed"));
            return;
          }

          if (response.data !== undefined) {
            resolve(response.data);
            return;
          }

          resolve(response as T);
        },
      );
  });
}

export async function sendCallOffer({
  callId,
  receiverId,
  offer,
}: {
  callId: string;
  receiverId: number;
  offer: RTCSessionDescriptionInit;
}) {
  await emitCallEvent("call:offer", {
    callId,
    receiverId,
    offer,
  });
}

export async function sendCallAnswer({
  callId,
  receiverId,
  answer,
}: {
  callId: string;
  receiverId: number;
  answer: RTCSessionDescriptionInit;
}) {
  await emitCallEvent("call:answer", {
    callId,
    receiverId,
    answer,
  });
}

export async function sendIceCandidate({
  callId,
  candidate,
}: {
  callId: string;
  candidate: RTCIceCandidateInit;
}) {
  await emitCallEvent("call:ice-candidate", {
    callId,
    candidate,
  });
}

export function onCallOffer(
  callback: (data: {
    callId: string;
    senderId: number;
    offer: RTCSessionDescriptionInit;
    callType: "audio" | "video";
  }) => void,
) {
  return listenForSocketEvent("call:offer", callback);
}

export function onCallAnswer(
  callback: (data: {
    callId: string;
    senderId: number;
    answer: RTCSessionDescriptionInit;
  }) => void,
) {
  return listenForSocketEvent("call:answer", callback);
}

export function onIceCandidate(
  callback: (data: {
    callId: string;
    senderId: number;
    candidate: RTCIceCandidateInit;
  }) => void,
) {
  return listenForSocketEvent("call:ice-candidate", callback);
}

export async function initiateCall({
  callType,
  conversationId,
}: {
  callType: CallType;
  conversationId: number;
}): Promise<{
  callId: string;
  participantCount: number;
  participantStatuses: Record<number, ParticipantCallStatus>;
}> {
  const result = await emitCallEventWithAck<{
    callId: string;
    participantCount: number;
    participantStatuses: Record<number, ParticipantCallStatus>;
  }>("call:initiate", {
    callType,
    conversationId,
  });

  if (!result.callId) {
    throw new Error("Server did not return a call ID");
  }

  return {
    callId: result.callId,
    participantCount: result.participantCount,
    participantStatuses: result.participantStatuses,
  };
}

export async function acceptCall({ callId }: { callId: string }) {
  await emitCallEvent("call:accept", { callId });
}

export async function declineCall({ callId }: { callId: string }) {
  await emitCallEvent("call:decline", { callId });
}

export async function endCall({ callId }: { callId: string }) {
  await emitCallEvent("call:end", { callId });
}

export async function sendCallCameraState({
  callId,
  cameraOn,
}: {
  callId: string;
  cameraOn: boolean;
}) {
  await emitCallEvent("call:camera-state", { callId, cameraOn });
}

export async function sendCallScreenShareState({
  callId,
  isSharing,
}: {
  callId: string;
  isSharing: boolean;
}) {
  await emitCallEvent("call:screen-share-state", { callId, isSharing });
}

export function onCallCameraState(
  callback: (data: {
    callId: string;
    userId: number;
    cameraOn: boolean;
  }) => void,
) {
  return listenForSocketEvent("call:camera-state", callback);
}

export function onCallScreenShareState(
  callback: (data: {
    callId: string;
    userId: number;
    isSharing: boolean;
  }) => void,
) {
  return listenForSocketEvent("call:screen-share-state", callback);
}

export function onIncomingCall(
  callback: (data: {
    callId: string;
    conversationId: number;
    callerId: number;
    callType: CallType;
    participantCount: number;
    participantStatuses: Record<number, ParticipantCallStatus>;
  }) => void,
) {
  return listenForSocketEvent("incoming-call", callback);
}

export function onCallAccepted(
  callback: (data: {
    callId: string;
    userId: number;
    peerIds: number[];
    offerPeerIds: number[];
  }) => void,
) {
  return listenForSocketEvent("call:accepted", callback);
}

export function onCallDeclined(
  callback: (data: { callId: string; userId: number }) => void,
) {
  return listenForSocketEvent("call:declined", callback);
}

export function onCallEnded(
  callback: (data: { callId: string; userId: number }) => void,
) {
  return listenForSocketEvent("call:ended", callback);
}

export function onCallParticipantLeft(
  callback: (data: { callId: string; userId: number }) => void,
) {
  return listenForSocketEvent("call:participant-left", callback);
}

export function onCallParticipantStatus(
  callback: (data: {
    callId: string;
    userId: number;
    status: ParticipantCallStatus;
  }) => void,
) {
  return listenForSocketEvent("call:participant-status", callback);
}

export async function publishCallWhiteboardStroke({
  callId,
  stroke,
}: {
  callId: string;
  stroke: CallWhiteboardStroke;
}) {
  await emitCallEvent("call:whiteboard:stroke", { callId, stroke });
}

export async function clearCallWhiteboard({ callId }: { callId: string }) {
  await emitCallEvent("call:whiteboard:clear", { callId });
}

export function onCallWhiteboardStroke(
  callback: (data: {
    callId: string;
    userId: number;
    stroke: CallWhiteboardStroke;
  }) => void,
) {
  return listenForSocketEvent("call:whiteboard:stroke", callback);
}

export function onCallWhiteboardCleared(
  callback: (data: { callId: string; userId: number }) => void,
) {
  return listenForSocketEvent("call:whiteboard:clear", callback);
}

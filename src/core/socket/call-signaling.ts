import { connectSocket, getSocket } from "./client";

type CallType = "audio" | "video";

type CallEventData = Record<string, unknown>;

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
  answer,
}: {
  callId: string;
  answer: RTCSessionDescriptionInit;
}) {
  await emitCallEvent("call:answer", {
    callId,
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
  }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("call:offer", callback);
  return () => socket.off("call:offer", callback);
}

export function onCallAnswer(
  callback: (data: {
    callId: string;
    senderId?: number;
    answer: RTCSessionDescriptionInit;
  }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("call:answer", callback);
  return () => socket.off("call:answer", callback);
}

export function onIceCandidate(
  callback: (data: {
    callId: string;
    senderId: number;
    candidate: RTCIceCandidateInit;
  }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("call:ice-candidate", callback);
  return () => socket.off("call:ice-candidate", callback);
}

export async function initiateCall({
  callType,
  conversationId,
}: {
  callType: CallType;
  conversationId: number;
}): Promise<string> {
  const result = await emitCallEventWithAck<{
    callId: string;
  }>("call:initiate", {
    callType,
    conversationId,
  });

  if (!result.callId) {
    throw new Error("Server did not return a call ID");
  }

  return result.callId;
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

export function onIncomingCall(
  callback: (data: {
    callId: string;
    conversationId: number;
    callerId: number;
    callType: CallType;
  }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("incoming-call", callback);
  return () => socket.off("incoming-call", callback);
}

export function onCallAccepted(
  callback: (data: { callId: string; userId: number }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("call:accepted", callback);
  return () => socket.off("call:accepted", callback);
}

export function onCallDeclined(
  callback: (data: { callId: string; userId: number }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("call:declined", callback);
  return () => socket.off("call:declined", callback);
}

export function onCallEnded(
  callback: (data: { callId: string; userId: number }) => void,
) {
  const socket = getSocket();
  if (!socket) return;

  socket.on("call:ended", callback);
  return () => socket.off("call:ended", callback);
}

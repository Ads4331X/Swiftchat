import { sendIceCandidate } from "@/core/socket/call-signaling";
import type { MediaStream as RNMediaStream } from "react-native-webrtc";

const peerConnections = new Map<number, RTCPeerConnection>();

const pendingIceCandidates = new Map<number, RTCIceCandidateInit[]>();

const audioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 480, max: 640 },
  height: { ideal: 360, max: 480 },
  frameRate: { ideal: 20, max: 24 },
  facingMode: "user",
};

const iceServers: RTCConfiguration["iceServers"] = [
  {
    urls: "stun:stun.relay.metered.ca:80",
  },
  {
    urls: [
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:80?transport=tcp",
      "turn:global.relay.metered.ca:443",
      "turns:global.relay.metered.ca:443?transport=tcp",
    ],
    username: process.env.EXPO_PUBLIC_TURN_USERNAME!,
    credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL!,
  },
];

export async function requestPermissions({
  callType,
}: {
  callType: "audio" | "video";
}) {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  // Browsers prompt on getUserMedia. Only fail fast when permission is denied.
  try {
    if (callType === "video") {
      const camera = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
      if (camera.state === "denied") return false;
    }

    const microphone = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    if (microphone.state === "denied") return false;
  } catch {
    // Some browsers do not support querying these permission names.
  }

  return true;
}

export function createPeerConnection({
  participantId,
  callId,
  onRemoteStream,
  onConnectionStateChange,
}: {
  participantId: number;
  callId: string;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: RNMediaStream) => void;
}) {
  if (peerConnections.has(participantId)) {
    return peerConnections.get(participantId);
  }

  const participantPeer = new RTCPeerConnection({ iceServers });

  peerConnections.set(participantId, participantPeer);

  participantPeer.onconnectionstatechange = () => {
    onConnectionStateChange(participantPeer.connectionState);
  };

  participantPeer.ontrack = (event) => {
    try {
      const stream = handleRemoteTrack({
        event: event as unknown as { streams: readonly RNMediaStream[] },
      });
      onRemoteStream(stream);
    } catch (err) {
      console.error("Failed to handle remote track:", err);
    }
  };

  participantPeer.onicecandidate = (event) => {
    if (event.candidate) {
      sendIceCandidate({
        callId,
        candidate: event.candidate.toJSON(),
      });
    }
  };

  return participantPeer;
}

function mediaErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const detail = error instanceof Error ? error.message : String(error);

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone/camera permission was denied. Allow access in the browser and try again.";
    case "NotFoundError":
      return "No microphone or camera was found on this device.";
    case "NotReadableError":
      return "The microphone or camera is already in use by another app or tab.";
    case "OverconstrainedError":
      return "The requested camera settings are not supported by this device.";
    case "AbortError":
      return "The browser aborted access to the microphone or camera. Please try again.";
    default:
      return detail || "Could not access the microphone or camera.";
  }
}

export async function getLocalMedia({
  callType,
}: {
  callType: "audio" | "video";
}) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera and microphone require a secure context. Open the app on https:// or http://localhost.",
    );
  }

  const mediaConstraints: MediaStreamConstraints = {
    audio: audioConstraints,
    video: callType === "video" ? videoConstraints : false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
    return stream as unknown as RNMediaStream;
  } catch (err) {
    // A camera that is missing/busy should not kill the whole call.
    if (
      callType === "video" &&
      err instanceof DOMException &&
      ["NotFoundError", "NotReadableError", "OverconstrainedError", "AbortError"].includes(
        err.name,
      )
    ) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        console.warn(
          `Camera unavailable (${err.name}); continuing with audio only.`,
        );
        return audioOnly as unknown as RNMediaStream;
      } catch {
        // fall through to the original error below
      }
    }

    console.error("getUserMedia failed:", err);
    throw new Error(mediaErrorMessage(err));
  }
}

export async function addLocalTracks({
  stream,
  peerConnection,
}: {
  stream: RNMediaStream;
  peerConnection: RTCPeerConnection;
}) {
  const webStream = stream as unknown as MediaStream;

  for (const track of webStream.getTracks()) {
    peerConnection.addTrack(track, webStream);
  }

  await limitSenderBandwidth(peerConnection);
}

async function limitSenderBandwidth(peerConnection: RTCPeerConnection) {
  for (const sender of peerConnection.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;

    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) parameters.encodings = [{}];

      for (const encoding of parameters.encodings) {
        if (kind === "video") {
          encoding.maxBitrate = 400_000;
          encoding.maxFramerate = 20;
        } else {
          encoding.maxBitrate = 48_000;
        }
      }

      parameters.degradationPreference =
        kind === "video" ? "maintain-framerate" : "balanced";
      await sender.setParameters(parameters);
    } catch (err) {
      console.warn("Could not set sender bandwidth limits:", err);
    }
  }
}

export function handleRemoteTrack({
  event,
}: {
  event: { streams: readonly RNMediaStream[] };
}) {
  const firstStream = event.streams[0];

  if (!firstStream) {
    throw new Error("Stream not found");
  }

  return firstStream;
}

export function closePeerConnection({
  participantId,
}: {
  participantId: number;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc) return;

  pc.close();

  peerConnections.delete(participantId);
  pendingIceCandidates.delete(participantId);
}

export function closeAllPeerConnections() {
  for (const [, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();
  pendingIceCandidates.clear();
}

export async function stopLocalMedia({ stream }: { stream: RNMediaStream }) {
  const webStream = stream as unknown as MediaStream;

  for (const track of webStream.getTracks()) {
    track.stop();
  }
}

export function toggleMicrophone({ stream }: { stream: RNMediaStream }) {
  const tracks = stream.getAudioTracks();

  if (tracks.length === 0) return false;

  const enabled = !tracks[0].enabled;

  for (const track of tracks) {
    track.enabled = enabled;
  }

  return enabled;
}

export function toggleCamera({ stream }: { stream: RNMediaStream }) {
  const tracks = stream.getVideoTracks();

  if (tracks.length === 0) return false;

  const enabled = !tracks[0].enabled;

  for (const track of tracks) {
    track.enabled = enabled;
  }

  return enabled;
}

export async function createOffer({
  participantId,
}: {
  participantId: number;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc) return;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  return offer;
}

export async function createAnswer({
  offer,
  participantId,
}: {
  offer: RTCSessionDescriptionInit;
  participantId: number;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc) return;

  await pc.setRemoteDescription(offer);
  await processPendingIceCandidates({ participantId });

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function handleAnswer({
  answer,
  participantId,
}: {
  answer: RTCSessionDescriptionInit;
  participantId: number;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc) return;

  await pc.setRemoteDescription(answer);
  await processPendingIceCandidates({ participantId });
}

export async function addIceCandidate({
  participantId,
  candidate,
}: {
  participantId: number;
  candidate: RTCIceCandidateInit;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc || !pc.remoteDescription) {
    const pending = pendingIceCandidates.get(participantId) ?? [];
    pending.push(candidate);
    pendingIceCandidates.set(participantId, pending);
    return;
  }

  await pc.addIceCandidate(candidate);
}

export async function processPendingIceCandidates({
  participantId,
}: {
  participantId: number;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc?.remoteDescription) return;

  const pending = pendingIceCandidates.get(participantId) ?? [];
  pendingIceCandidates.delete(participantId);

  for (const candidate of pending) {
    await pc.addIceCandidate(candidate);
  }
}

export async function startCallAudio(_args: {
  callType: "audio" | "video";
}) {}

export function setCallSpeakerphone(_enabled: boolean) {}

export async function stopCallAudio() {}

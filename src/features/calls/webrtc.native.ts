import { sendIceCandidate } from "@/core/socket/call-signaling";
import { AudioModule } from "expo-audio";
import { requestCameraPermissionsAsync } from "expo-image-picker";
import InCallManager from "react-native-incall-manager";
import type {
  MediaStream,
  RTCPeerConnection as RTCPeerConnectionType,
} from "react-native-webrtc";

import { getWebRTC } from "./webrtc-module";

// the library's types don't expose the event handlers, so we describe the ones we use
type PeerEventHandlers = {
  onconnectionstatechange: (() => void) | null;
  ontrack: ((event: { streams: readonly MediaStream[] }) => void) | null;
  onicecandidate:
    | ((event: {
        candidate: { toJSON: () => RTCIceCandidateInit } | null;
      }) => void)
    | null;
};

// takes the types from the library's own methods so they match
type LibSessionDescription = Parameters<
  RTCPeerConnectionType["setRemoteDescription"]
>[0];
type LibIceCandidate = Parameters<
  RTCPeerConnectionType["addIceCandidate"]
>[0];

export async function requestPermissions({
  callType,
}: {
  callType: "audio" | "video";
}) {
  if (callType === "video") {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) return false;
  }
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  if (!permission.granted) return false;
  return true;
}

const peerConnections = new Map<number, RTCPeerConnectionType>();

const pendingIceCandidates = new Map<number, RTCIceCandidateInit[]>(); // Stores ICE candidates that arrive before the remote description is ready.

export function createPeerConnection({
  participantId,
  callId,
  onRemoteStream,
  onConnectionStateChange,
}: {
  participantId: number;
  callId: string;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream) => void;
}) {
  // if peer connection is already there
  if (peerConnections.has(participantId)) {
    return peerConnections.get(participantId);
  }

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

  const iceConfiguration: RTCConfiguration = {
    iceServers,
  };

  // initializes and creates a new peer connection
  const { RTCPeerConnection } = getWebRTC();
  const participantPeer = new RTCPeerConnection(iceConfiguration);

  peerConnections.set(participantId, participantPeer);

  // typed view of the peer so we can set the handlers
  const peerEvents = participantPeer as unknown as PeerEventHandlers;

  // callback for connection state change
  peerEvents.onconnectionstatechange = () => {
    onConnectionStateChange(participantPeer.connectionState);
  };

  // callback for receiving a remote track
  peerEvents.ontrack = (event) => {
    try {
      const stream = handleRemoteTrack({ event });
      onRemoteStream(stream);
    } catch (err) {
      console.error("Failed to handle remote track:", err);
    }
  };

  peerEvents.onicecandidate = (event) => {
    if (event.candidate) {
      sendIceCandidate({
        callId,
        candidate: event.candidate.toJSON(),
      });
    }
  };

  return participantPeer;
}

export async function getLocalMedia({
  callType,
}: {
  callType: "audio" | "video";
}) {
  try {
    type CallMediaConstraints = {
      audio: {
        googEchoCancellation: boolean;
        googNoiseSuppression: boolean;
        googAutoGainControl: boolean;
      };
      video:
        | false
        | {
            width: { ideal: number; max: number };
            height: { ideal: number; max: number };
            frameRate: { ideal: number; max: number };
            facingMode: string;
          };
    };

    const mediaConstraints: CallMediaConstraints = {
      audio: {
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true,
      },
      video:
        callType === "video"
          ? {
              width: { ideal: 480, max: 640 },
              height: { ideal: 360, max: 480 },
              frameRate: { ideal: 20, max: 24 },
              facingMode: "user",
            }
          : false,
    };

    const { mediaDevices } = getWebRTC();
    // Native WebRTC accepts these processing flags, but its TS declaration omits them.
    const stream = await mediaDevices.getUserMedia(
      mediaConstraints as unknown as Parameters<
        typeof mediaDevices.getUserMedia
      >[0],
    );
    return stream;
  } catch (err) {
    console.error("getUserMedia failed:", err);
    throw err instanceof Error
      ? err
      : new Error("Failed to access microphone or camera");
  }
}

export async function startCallAudio({
  callType,
}: {
  callType: "audio" | "video";
}) {
  try {
    InCallManager.start({
      media: callType === "video" ? "video" : "audio",
      auto: true,
    });
    InCallManager.setKeepScreenOn(true);
  } catch (err) {
    console.warn("Could not configure call audio:", err);
  }
}

export function setCallSpeakerphone(enabled: boolean) {
  InCallManager.setForceSpeakerphoneOn(enabled);
}

export async function stopCallAudio() {
  try {
    InCallManager.setKeepScreenOn(false);
    InCallManager.setForceSpeakerphoneOn(false);
    InCallManager.stop();
  } catch (err) {
    console.warn("Could not reset call audio:", err);
  }
}

export async function addLocalTracks({
  stream,
  peerConnection,
}: {
  stream: MediaStream;
  peerConnection: RTCPeerConnectionType;
}) {
  // loop through all the stream tracks
  for (const track of stream.getTracks()) {
    peerConnection.addTrack(track, stream); // adds each track to the peerconnection (with its stream so the other side gets it)
  }

  await limitSenderBandwidth(peerConnection);
}

async function limitSenderBandwidth(
  peerConnection: RTCPeerConnectionType,
) {
  for (const sender of peerConnection.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;

    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) {
        parameters.encodings = [{ active: true }];
      }

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
  event: { streams: readonly MediaStream[] };
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

export async function stopLocalMedia({ stream }: { stream: MediaStream }) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function toggleMicrophone({ stream }: { stream: MediaStream }) {
  const tracks = stream.getAudioTracks();

  if (tracks.length === 0) return false;

  const enabled = !tracks[0].enabled;

  for (const track of tracks) {
    track.enabled = enabled;
  }

  return enabled;
}

export function toggleCamera({ stream }: { stream: MediaStream }) {
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

  const offer = await pc.createOffer(); // creates proposals of how devices can communicate

  // saves (sets) your own connection information.
  await pc.setLocalDescription(offer); // saves the proposal (offer) in memory
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

  // saves (sets) the other participant's connection information.
  await pc.setRemoteDescription(offer as unknown as LibSessionDescription); // saves the proposal (offer) send my other participants

  await processPendingIceCandidates({ participantId });

  // creates an response of the offer provided
  const answer = await pc.createAnswer();

  await pc.setLocalDescription(answer); // saves the answer generated from the offer
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

  await pc.setRemoteDescription(answer as unknown as LibSessionDescription); // sets the answer send by the participant to remote

  await processPendingIceCandidates({ participantId });
}

// finds the network path between the users in the call
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

  await pc.addIceCandidate(candidate as unknown as LibIceCandidate);
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
    await pc.addIceCandidate(candidate as unknown as LibIceCandidate);
  }
}

import { sendIceCandidate } from "@/core/socket/call-signaling";
import { AudioModule } from "expo-audio";
import { requestCameraPermissionsAsync } from "expo-image-picker";
import {
  MediaStream,
  RTCPeerConnection,
  mediaDevices,
} from "react-native-webrtc";

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
  RTCPeerConnection["setRemoteDescription"]
>[0];
type LibIceCandidate = Parameters<RTCPeerConnection["addIceCandidate"]>[0];

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

const peerConnections = new Map<number, RTCPeerConnection>();

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
    // media constrant accoprding to call type
    const mediaConstraints = {
      audio: true,
      video:
        callType === "video" ? { frameRate: 30, facingMode: "user" } : false,
    };

    // creates a stream and returns it
    const stream = await mediaDevices.getUserMedia(mediaConstraints);
    return stream;
  } catch (err) {
    console.log(err);
  }
}

export async function addLocalTracks({
  stream,
  peerConnection,
}: {
  stream: MediaStream;
  peerConnection: RTCPeerConnection;
}) {
  // loop through all the stream tracks
  for (const track of stream.getTracks()) {
    peerConnection.addTrack(track, stream); // adds each track to the peerconnection (with its stream so the other side gets it)
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

  pc?.close();

  peerConnections.delete(participantId);
}

export function closeAllPeerConnections() {
  for (const [, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();
}

export async function stopLocalMedia({ stream }: { stream: MediaStream }) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function toggleMicrophone({ stream }: { stream: MediaStream }) {
  let isMicEnabled = false;

  for (const track of stream.getAudioTracks()) {
    isMicEnabled = track.enabled;
    track.enabled = !track.enabled;
  }

  return !isMicEnabled;
}

export function toggleCamera({ stream }: { stream: MediaStream }) {
  let isCameraEnabled = false;

  if (stream.getVideoTracks().length === 0) return false;

  for (const track of stream.getVideoTracks()) {
    isCameraEnabled = track.enabled;
    track.enabled = !track.enabled;
  }

  return !isCameraEnabled;
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
  if (!pc) return;

  await pc.addIceCandidate(candidate as unknown as LibIceCandidate);
}

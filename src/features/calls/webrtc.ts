import { AudioModule } from "expo-audio";
import { requestCameraPermissionsAsync } from "expo-image-picker";
import { mediaDevices } from "react-native-webrtc";

async function requestPermissions({
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
  onRemoteStream,
  onConnectionStateChange,
}: {
  participantId: number;
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

  // callback for connection state change
  participantPeer.onconnectionstatechange = () => {
    onConnectionStateChange(participantPeer.connectionState);
  };

  // callback for receiving a remote track
  participantPeer.ontrack = (event) => {
    try {
      const stream = handleRemoteTrack({ event });
      onRemoteStream(stream);
    } catch (err) {
      console.error("Failed to handle remote track:", err);
    }
  };

  participantPeer.onicecandidate = (event) => {
    if (event.candidate) {
      // send the candidate
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
    peerConnection.addTrack(track); // adds each track to the peerconnection
  }
}

export function handleRemoteTrack({ event }: { event: RTCTrackEvent }) {
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
  await pc.setRemoteDescription(offer); // saves the proposal (offer) send my other participants

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

  await pc.setRemoteDescription(answer); // sets the answer send by the participant to remote
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

  await pc.addIceCandidate(candidate);
}

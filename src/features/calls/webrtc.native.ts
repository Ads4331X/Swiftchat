import { sendIceCandidate } from "@/core/socket/call-signaling";
import { AudioModule } from "expo-audio";
import { requestCameraPermissionsAsync } from "expo-image-picker";
import { NativeModules, Platform } from "react-native";
import InCallManager from "react-native-incall-manager";
import type {
  MediaStream,
  MediaStreamTrack,
  RTCPeerConnection as RTCPeerConnectionType,
} from "react-native-webrtc";

import { getWebRTC } from "./webrtc-module";

// the library's types don't expose the event handlers, so we describe the ones we use
type PeerEventHandlers = {
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  onicecandidateerror: ((event: {
    errorCode?: number;
    errorText?: string;
    url?: string;
  }) => void) | null;
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
const hasInCallManager = Boolean(NativeModules.InCallManager);
let warnedAboutMissingInCallManager = false;

export function createPeerConnection({
  participantId,
  callId,
  onRemoteStream,
  onConnectionStateChange,
}: {
  participantId: number;
  callId: string;
  onConnectionStateChange: (
    state: RTCPeerConnectionState,
    iceState: RTCIceConnectionState,
    participantId: number,
  ) => void;
  onRemoteStream: (participantId: number, stream: MediaStream) => void;
}) {
  // if peer connection is already there
  if (peerConnections.has(participantId)) {
    return peerConnections.get(participantId);
  }

  const iceServers: RTCConfiguration["iceServers"] = [
    {
      urls: "stun:stun.relay.metered.ca:80",
    },
    ...(hasTurnCredentials() ? [{
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443",
        "turns:global.relay.metered.ca:443?transport=tcp",
      ],
      username: process.env.EXPO_PUBLIC_TURN_USERNAME!.trim(),
      credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL!.trim(),
    }] : []),
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
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  peerEvents.oniceconnectionstatechange = () => {
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  peerEvents.onicecandidateerror = (event) => {
    console.warn("WebRTC ICE candidate error:", {
      code: event.errorCode,
      message: event.errorText,
      server: event.url,
    });
  };

  // callback for receiving a remote track
  peerEvents.ontrack = (event) => {
    try {
      const stream = handleRemoteTrack({ event });
      onRemoteStream(participantId, stream);
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

export function hasTurnCredentials() {
  return Boolean(
    process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() &&
      process.env.EXPO_PUBLIC_TURN_CREDENTIAL?.trim(),
  );
}

function getVideoConstraints() {
  return {
    width: { ideal: 720, max: 1280 },
    height: { ideal: 1280, max: 1280 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: "user",
  };
}

export async function getLocalMedia({
  callType,
}: {
  callType: "audio" | "video";
}) {
  try {
    const videoConstraints = getVideoConstraints();

    type CallMediaConstraints = {
      audio: {
        googEchoCancellation: boolean;
        googNoiseSuppression: boolean;
        googAutoGainControl: boolean;
      };
      video:
        | false
        | typeof videoConstraints;
    };

    const mediaConstraints: CallMediaConstraints = {
      audio: {
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true,
      },
      video: callType === "video" ? videoConstraints : false,
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

export async function getLocalVideoMedia() {
  try {
    const { mediaDevices } = getWebRTC();
    const stream = await mediaDevices.getUserMedia({
      audio: false,
      video: getVideoConstraints(),
    });
    return stream;
  } catch (err) {
    console.error("Camera getUserMedia failed:", err);
    throw err instanceof Error ? err : new Error("Failed to access the camera");
  }
}

export async function switchCamera({ stream }: { stream: MediaStream }) {
  const videoTracks = stream.getVideoTracks();
  const track = videoTracks[0];

  if (!track) {
    throw new Error("Enable your camera before switching cameras.");
  }
  if (videoTracks.length > 1) {
    throw new Error(
      "More than one local video track is active. Restart the call before switching cameras.",
    );
  }

  let devices: unknown;
  try {
    devices = await getWebRTC().mediaDevices.enumerateDevices();
  } catch (err) {
    throw new Error(
      `Could not check camera availability. ${
        err instanceof Error ? err.message : "Please try again."
      }`,
    );
  }

  const cameraDevices = Array.isArray(devices)
    ? devices.filter(
        (device): device is { kind: string; facing: string } =>
          typeof device === "object" &&
          device !== null &&
          "kind" in device &&
          device.kind === "videoinput" &&
          "facing" in device &&
          typeof device.facing === "string",
      )
    : [];
  const hasFrontCamera = cameraDevices.some(
    (device) => device.facing === "front" || device.facing === "user",
  );
  const hasRearCamera = cameraDevices.some(
    (device) => device.facing === "environment" || device.facing === "back",
  );

  if (!hasFrontCamera || !hasRearCamera) {
    throw new Error("This device does not have both front and rear cameras.");
  }

  const settings = track.getSettings();
  const targetFacingMode =
    settings.facingMode === "environment" ? "user" : "environment";

  try {
    await track.applyConstraints({
      facingMode: targetFacingMode,
      ...(settings.width ? { width: settings.width } : {}),
      ...(settings.height ? { height: settings.height } : {}),
      ...(settings.frameRate ? { frameRate: settings.frameRate } : {}),
    });
  } catch (err) {
    console.warn("Could not switch camera:", err);
    const detail = err instanceof Error ? err.message : "Please try again.";
    throw new Error(
      `Could not switch to the other camera. This device may not have both front and rear cameras. ${detail}`,
    );
  }
}

export async function startCallAudio({
  callType,
}: {
  callType: "audio" | "video";
}) {
  if (!hasInCallManager) {
    if (!warnedAboutMissingInCallManager) {
      console.warn(
        "Call audio routing is unavailable in this app build. Rebuild and reinstall the Android app to include react-native-incall-manager.",
      );
      warnedAboutMissingInCallManager = true;
    }
    return;
  }

  try {
    InCallManager.start({
      media: callType === "video" ? "video" : "audio",
      auto: true,
    });
    InCallManager.setKeepScreenOn(true);
    setCallSpeakerphone(callType === "video");
  } catch (err) {
    console.warn("Could not configure call audio:", err);
  }
}

export function setCallSpeakerphone(enabled: boolean) {
  if (!hasInCallManager) {
    throw new Error(
      "Audio output controls are unavailable in this app build. Rebuild and reinstall the Android app.",
    );
  }

  if (Platform.OS === "ios") {
    InCallManager.setSpeakerphoneOn(enabled);
    return;
  }

  InCallManager.setForceSpeakerphoneOn(enabled);
}

export async function stopCallAudio() {
  if (!hasInCallManager) return;

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
  for (const track of stream.getTracks()) {
    if (
      peerConnection
        .getSenders()
        .some((sender) => sender.track?.id === track.id)
    ) {
      continue;
    }

    peerConnection.addTrack(track, stream);
  }

  await limitSenderBandwidth(peerConnection);
}

export async function addLocalTracksToPeerConnection({
  participantId,
  stream,
}: {
  participantId: number;
  stream: MediaStream;
}) {
  const peerConnection = peerConnections.get(participantId);
  if (!peerConnection) return;

  await addLocalTracks({ stream, peerConnection });
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
          delete encoding.maxBitrate;
          encoding.maxFramerate = 30;
        } else {
          encoding.maxBitrate = 64_000;
        }
      }

      parameters.degradationPreference = "balanced";
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

  peerConnections.delete(participantId);
  pendingIceCandidates.delete(participantId);
  try {
    pc.close();
  } catch (err) {
    console.warn("Could not close call connection:", err);
  }
}

export function closeAllPeerConnections() {
  const connections = [...peerConnections.values()];
  peerConnections.clear();
  pendingIceCandidates.clear();

  for (const pc of connections) {
    try {
      pc.close();
    } catch (err) {
      console.warn("Could not close call connection:", err);
    }
  }
}

/** Read-only snapshot of active peer connections for diagnostics. */
export function getPeerConnections(): ReadonlyMap<number, RTCPeerConnectionType> {
  return peerConnections;
}

export async function stopLocalMedia({ stream }: { stream: MediaStream }) {
  if (screenShareTrack) {
    try {
      await stopScreenShare({ localStream: stream });
    } catch (error) {
      console.warn("Could not restore the camera while ending the call:", error);
    }
  }

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

// --- Screen sharing (native) ---

let screenShareTrack: MediaStreamTrack | null = null;
let screenShareEndedListener: (() => void) | null = null;
let previousCameraTrack: MediaStreamTrack | null = null;
let previousCameraEnabled = true;
type ScreenCaptureTrack = MediaStreamTrack & {
  addEventListener: (event: "ended", listener: () => void) => void;
  removeEventListener: (event: "ended", listener: () => void) => void;
};

export async function startScreenShare({
  localStream,
  onStopped,
}: {
  localStream: MediaStream;
  onStopped?: () => void;
}): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error(
      "Native screen sharing is currently available on Android only.",
    );
  }
  if (screenShareTrack) {
    throw new Error("Screen sharing is already active.");
  }

  const displayStream = await getWebRTC().mediaDevices.getDisplayMedia();
  const track = displayStream.getVideoTracks()[0];
  if (!track) {
    displayStream.getTracks().forEach((displayTrack) => displayTrack.stop());
    throw new Error("Android did not provide a screen capture track.");
  }

  const currentVideoTrack = localStream.getVideoTracks()[0] ?? null;
  if (!currentVideoTrack || currentVideoTrack.readyState !== "live") {
    displayStream.getTracks().forEach((displayTrack) => displayTrack.stop());
    throw new Error("Start a video call before sharing your screen.");
  }

  const replacedSenders: ReturnType<
    RTCPeerConnectionType["getSenders"]
  > = [];
  try {
    for (const peerConnection of peerConnections.values()) {
      for (const sender of peerConnection.getSenders()) {
        if (sender.track?.id !== currentVideoTrack.id) continue;
        if (track.readyState !== "live") {
          throw new Error("Screen sharing ended before it could start.");
        }
        await sender.replaceTrack(track);
        replacedSenders.push(sender);
      }
    }
    if (replacedSenders.length === 0) {
      throw new Error("No active video connection is available to share.");
    }
    if (track.readyState !== "live") {
      throw new Error("Screen sharing ended before it could start.");
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const sender of replacedSenders) {
      try {
        await sender.replaceTrack(currentVideoTrack);
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error
            ? rollbackError.message
            : "A camera track could not be restored.",
        );
      }
    }
    displayStream.getTracks().forEach((displayTrack) => displayTrack.stop());
    const rollbackDetail =
      rollbackErrors.length > 0
        ? ` Camera restoration also failed: ${rollbackErrors.join("; ")}`
        : "";
    throw new Error(
      `Could not start screen sharing. ${
        error instanceof Error ? error.message : "Please try again."
      }${rollbackDetail}`,
    );
  }

  previousCameraTrack = currentVideoTrack;
  previousCameraEnabled = currentVideoTrack.enabled;
  currentVideoTrack.enabled = false;
  localStream.removeTrack(currentVideoTrack);
  localStream.addTrack(track);
  screenShareTrack = track;

  screenShareEndedListener = () => {
    void stopScreenShare({ localStream }).then(
      () => onStopped?.(),
      (error: unknown) => {
        console.error("Could not restore the camera after screen sharing:", error);
        onStopped?.();
      },
    );
  };
  (track as ScreenCaptureTrack).addEventListener(
    "ended",
    screenShareEndedListener,
  );
}

export async function stopScreenShare({
  localStream,
}: {
  localStream: MediaStream;
}): Promise<void> {
  const track = screenShareTrack;
  const cameraTrack = previousCameraTrack;

  if (track) {
    if (screenShareEndedListener) {
      (track as ScreenCaptureTrack).removeEventListener(
        "ended",
        screenShareEndedListener,
      );
    }
    localStream.removeTrack(track);
  }

  const cameraIsLive = cameraTrack?.readyState === "live";
  if (cameraIsLive && cameraTrack) {
    cameraTrack.enabled = previousCameraEnabled;
    localStream.addTrack(cameraTrack);
  }

  const restorationErrors: string[] = [];
  for (const peerConnection of peerConnections.values()) {
    for (const sender of peerConnection.getSenders()) {
      if (sender.track?.id !== track?.id) continue;
      try {
        await sender.replaceTrack(cameraIsLive ? cameraTrack : null);
      } catch (error) {
        restorationErrors.push(
          error instanceof Error
            ? error.message
            : "A peer connection could not restore the camera.",
        );
      }
    }
  }

  track?.stop();
  screenShareTrack = null;
  screenShareEndedListener = null;
  previousCameraTrack = null;
  previousCameraEnabled = true;

  if (restorationErrors.length > 0) {
    throw new Error(
      `Could not restore the camera on every participant: ${restorationErrors.join("; ")}`,
    );
  }
}

export function isScreenSharing(): boolean {
  return screenShareTrack !== null && screenShareTrack.readyState === "live";
}

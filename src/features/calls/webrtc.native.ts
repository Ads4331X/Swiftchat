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

import {
  clearAllPeerOperationQueues,
  clearPeerOperationQueue,
  runPeerOperation,
  waitForStableSignalingState,
} from "./call-negotiation";
import { getIceServers, hasTurnCredentials } from "./webrtc-config";
import { getWebRTC } from "./webrtc-module";
import {
  describeSdp,
  describeTrack,
  logIceCandidateError,
  logPeerState,
  logRemoteTrack,
} from "./call-debug";
import { startCallStatsLogger } from "./call-diagnostics";

export { hasTurnCredentials };

// the library's types don't expose the event handlers, so we describe the ones we use
type PeerEventHandlers = {
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  onsignalingstatechange: (() => void) | null;
  onicegatheringstatechange: (() => void) | null;
  onicecandidateerror: ((event: {
    errorCode?: number;
    errorText?: string;
    url?: string;
    address?: string;
    port?: number;
    hostCandidate?: string;
  }) => void) | null;
  ontrack:
    | ((event: {
        streams: readonly MediaStream[];
        track?: MediaStreamTrack;
      }) => void)
    | null;
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
type LibLocalSessionDescription = Parameters<
  RTCPeerConnectionType["setLocalDescription"]
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
const stopStatsLoggers = new Map<number, () => void>();
const screenShareSenders = new Map<
  number,
  ReturnType<RTCPeerConnectionType["addTrack"]>
>();

const pendingIceCandidates = new Map<number, RTCIceCandidateInit[]>(); // Stores ICE candidates that arrive before the remote description is ready.
const politePeerConnections = new Map<number, boolean>();
const hasInCallManager = Boolean(NativeModules.InCallManager);
let warnedAboutMissingInCallManager = false;
let warnedAboutSenderParameterFailure = false;

export function createPeerConnection({
  participantId,
  callId,
  polite = false,
  onRemoteStream,
  onConnectionStateChange,
}: {
  participantId: number;
  callId: string;
  polite?: boolean;
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

  const iceConfiguration: RTCConfiguration = {
    iceServers: getIceServers(),
  };

  // initializes and creates a new peer connection
  const { RTCPeerConnection } = getWebRTC();
  const participantPeer = new RTCPeerConnection(iceConfiguration);

  peerConnections.set(participantId, participantPeer);
  stopStatsLoggers.set(
    participantId,
    startCallStatsLogger(participantId, participantPeer),
  );
  politePeerConnections.set(participantId, polite);

  // typed view of the peer so we can set the handlers
  const peerEvents = participantPeer as unknown as PeerEventHandlers;

  const logState = () =>
    logPeerState({
      participantId,
      callId,
      connectionState: participantPeer.connectionState,
      iceConnectionState: participantPeer.iceConnectionState,
      signalingState: participantPeer.signalingState,
      iceGatheringState: participantPeer.iceGatheringState,
    });

  logState();

  // callback for connection state change
  peerEvents.onconnectionstatechange = () => {
    logState();
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  peerEvents.oniceconnectionstatechange = () => {
    logState();
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  peerEvents.onsignalingstatechange = logState;
  peerEvents.onicegatheringstatechange = logState;

  peerEvents.onicecandidateerror = (event) => {
    logIceCandidateError({ participantId, callId, event });
  };

  // callback for receiving a remote track
  peerEvents.ontrack = (event) => {
    logRemoteTrack({
      participantId,
      callId,
      streams: event.streams ?? [],
      track: event.track,
    });

    try {
      const stream = handleRemoteTrack({ event });
      onRemoteStream(participantId, stream);
    } catch (err) {
      console.error("Failed to handle remote track:", err);
    }
  };

  peerEvents.onicecandidate = (event) => {
    if (event.candidate) {
      void sendIceCandidateWithRetry({
        callId,
        candidate: event.candidate.toJSON(),
      });
    }
  };

  return participantPeer;
}

async function sendIceCandidateWithRetry({
  callId,
  candidate,
}: {
  callId: string;
  candidate: RTCIceCandidateInit;
}) {
  try {
    await sendIceCandidate({ callId, candidate });
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      await sendIceCandidate({ callId, candidate });
    } catch (retryError) {
      console.warn("Could not send an ICE candidate:", {
        firstError,
        retryError,
      });
    }
  }
}

function getVideoConstraints() {
  return {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
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
  const track = screenShareTrack ? previousCameraTrack : videoTracks[0];

  if (!track) {
    throw new Error("Enable your camera before switching cameras.");
  }
  if (!screenShareTrack && videoTracks.length > 1) {
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

function getSenderKind(
  peerConnection: RTCPeerConnectionType,
  sender: ReturnType<RTCPeerConnectionType["getSenders"]>[number],
) {
  if (sender.track?.kind) return sender.track.kind;

  try {
    return peerConnection
      .getTransceivers()
      .find((transceiver) => transceiver.sender === sender)?.receiver.track
      ?.kind;
  } catch {
    return undefined;
  }
}

export async function addLocalTracks({
  stream,
  peerConnection,
}: {
  stream: MediaStream;
  peerConnection: RTCPeerConnectionType;
}) {
  const tracks = stream.getTracks();
  if (
    screenShareTrack &&
    previousCameraTrack?.readyState === "live" &&
    !tracks.some((track) => track.id === previousCameraTrack?.id)
  ) {
    tracks.unshift(previousCameraTrack);
  }

  for (const track of tracks) {
    if (
      screenShareTrack &&
      track.kind === "video" &&
      track.id !== screenShareTrack.id &&
      !previousCameraTrack
    ) {
      previousCameraTrack = track;
      previousCameraEnabled = track.enabled;
    }
    const senders = peerConnection.getSenders();
    if (senders.some((sender) => sender.track?.id === track.id)) {
      continue;
    }

    const inactiveSender = senders.find(
      (sender) =>
        sender.track === null &&
        ![...screenShareSenders.values()].includes(sender) &&
        getSenderKind(peerConnection, sender) === track.kind,
    );
    let sender: ReturnType<RTCPeerConnectionType["addTrack"]>;
    if (inactiveSender) {
      await inactiveSender.replaceTrack(track);
      sender = inactiveSender;
    } else {
      sender = peerConnection.addTrack(track, stream);
    }

    if (track.id === screenShareTrack?.id) {
      const participantId = [...peerConnections].find(
        ([, connection]) => connection === peerConnection,
      )?.[0];
      if (participantId !== undefined) {
        screenShareSenders.set(participantId, sender);
      }
    }
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
  screenShareTrackId?: string,
) {
  for (const sender of peerConnection.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;

    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) {
        parameters.encodings = [{ active: true }];
      }

      const isScreenShare =
        kind === "video" &&
        sender.track?.id === (screenShareTrackId ?? screenShareTrack?.id);

      for (const encoding of parameters.encodings) {
        if (kind === "video") {
          if (isScreenShare) {
            encoding.maxBitrate = 1_500_000;
            encoding.maxFramerate = 15;
          } else {
            encoding.maxBitrate = 2_500_000;
            encoding.maxFramerate = 30;
          }
        } else {
          encoding.maxBitrate = 64_000;
        }
      }

      parameters.degradationPreference = "balanced";
      try {
        await sender.setParameters(parameters);
      } catch (error) {
        Reflect.deleteProperty(parameters, "degradationPreference");
        await sender.setParameters(parameters);
        if (!warnedAboutSenderParameterFailure) {
          warnedAboutSenderParameterFailure = true;
          console.warn(
            "Sender degradation preference is unsupported; using default adaptation.",
            error,
          );
        }
      }
    } catch (err) {
      if (!warnedAboutSenderParameterFailure) {
        warnedAboutSenderParameterFailure = true;
        console.warn("Could not set sender bandwidth limits:", err);
      }
    }
  }
}

export function handleRemoteTrack({
  event,
}: {
  event: {
    streams?: readonly MediaStream[] | null;
    track?: MediaStreamTrack;
  };
}) {
  const [firstStream] = event.streams ?? [];
  if (firstStream) return firstStream;

  if (event.track) {
    const { MediaStream } = getWebRTC();
    return new MediaStream([event.track]);
  }

  throw new Error("Remote track did not include a stream or track");
}

export function mergeRemoteStreams(
  existing: MediaStream | null,
  incoming: MediaStream,
) {
  if (!existing || existing === incoming) return incoming;

  const tracksById = new Map<string, MediaStreamTrack>();
  const existingTracks = existing.getTracks();
  for (const track of existingTracks) {
    const key = track.kind === "video" ? `video:${track.id}` : track.kind;
    tracksById.set(key, track);
  }
  for (const track of incoming.getTracks()) {
    const key = track.kind === "video" ? `video:${track.id}` : track.kind;
    tracksById.set(key, track);
  }

  if (
    tracksById.size === existingTracks.length &&
    existingTracks.every(
      (track) => {
        const key = track.kind === "video" ? `video:${track.id}` : track.kind;
        return tracksById.get(key) === track;
      },
    )
  ) {
    return existing;
  }

  const { MediaStream } = getWebRTC();
  const merged = new MediaStream();
  for (const track of tracksById.values()) {
    merged.addTrack(track);
  }
  return merged;
}

export function createVideoTrackStream(track: MediaStreamTrack): MediaStream {
  const { MediaStream } = getWebRTC();
  return new MediaStream([track]);
}

export function closePeerConnection({
  participantId,
}: {
  participantId: number;
}) {
  const pc = peerConnections.get(participantId);

  if (!pc) return;

  stopStatsLoggers.get(participantId)?.();
  stopStatsLoggers.delete(participantId);
  peerConnections.delete(participantId);
  screenShareSenders.delete(participantId);
  pendingIceCandidates.delete(participantId);
  politePeerConnections.delete(participantId);
  clearPeerOperationQueue(participantId);
  try {
    pc.close();
  } catch (err) {
    console.warn("Could not close call connection:", err);
  }
}

export function closeAllPeerConnections() {
  const connections = [...peerConnections.values()];
  for (const stopLogger of stopStatsLoggers.values()) stopLogger();
  stopStatsLoggers.clear();
  peerConnections.clear();
  screenShareSenders.clear();
  pendingIceCandidates.clear();
  politePeerConnections.clear();
  clearAllPeerOperationQueues();

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

export function toggleCamera({
  stream,
}: {
  stream: MediaStream;
}): boolean | null {
  if (screenShareTrack) {
    if (!previousCameraTrack) return null;
    previousCameraTrack.enabled = !previousCameraTrack.enabled;
    previousCameraEnabled = previousCameraTrack.enabled;
    return previousCameraTrack.enabled;
  }

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
  iceRestart = false,
}: {
  participantId: number;
  iceRestart?: boolean;
}): Promise<RTCSessionDescriptionInit | undefined> {
  const peerConnection = peerConnections.get(participantId);
  if (!peerConnection) return;

  const stable = await waitForStableSignalingState(peerConnection);
  if (!stable) {
    throw new Error(
      "Timed out waiting for the current call negotiation to finish.",
    );
  }

  return runPeerOperation(participantId, async () => {
    const pc = peerConnections.get(participantId);
    if (pc !== peerConnection || !pc || pc.signalingState === "closed") {
      return;
    }

    // Another negotiation may have started while this request was queued.
    if (pc.signalingState && pc.signalingState !== "stable") return;

    const offer = await pc.createOffer(
      iceRestart ? { iceRestart: true } : undefined,
    ); // creates proposals of how devices can communicate

    // saves (sets) your own connection information.
    await pc.setLocalDescription(offer); // saves the proposal (offer) in memory
    console.info("[call][negotiation] offer created", {
      participantId,
      iceRestart,
      sdp: describeSdp(offer.sdp),
      signalingState: pc.signalingState,
    });
    return offer;
  });
}

export async function createAnswer({
  offer,
  participantId,
}: {
  offer: RTCSessionDescriptionInit;
  participantId: number;
}): Promise<RTCSessionDescriptionInit | null | undefined> {
  const peerConnection = peerConnections.get(participantId);
  if (!peerConnection) return;

  return runPeerOperation(participantId, async () => {
    const pc = peerConnections.get(participantId);
    if (pc !== peerConnection || !pc || pc.signalingState === "closed") {
      return;
    }

    if (pc.signalingState === "have-local-offer") {
      if (!politePeerConnections.get(participantId)) {
        console.info(
          "Ignoring a colliding call offer while waiting for its answer.",
        );
        return null;
      }

      await pc.setLocalDescription({
        type: "rollback",
      } as unknown as LibLocalSessionDescription);
    }

    if (pc.signalingState !== "have-remote-offer") {
      // saves (sets) the other participant's connection information.
      await pc.setRemoteDescription(offer as unknown as LibSessionDescription); // saves the proposal (offer) send my other participants
    }

    await processPendingIceCandidates({ participantId });

    // creates an response of the offer provided
    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer); // saves the answer generated from the offer
    console.info("[call][negotiation] answer created", {
      participantId,
      sdp: describeSdp(answer.sdp),
      signalingState: pc.signalingState,
    });
    return answer;
  });
}

export async function handleAnswer({
  answer,
  participantId,
}: {
  answer: RTCSessionDescriptionInit;
  participantId: number;
}) {
  const peerConnection = peerConnections.get(participantId);
  if (!peerConnection) return;

  return runPeerOperation(participantId, async () => {
    const pc = peerConnections.get(participantId);
    if (
      pc !== peerConnection ||
      !pc ||
      (pc.signalingState && pc.signalingState !== "have-local-offer")
    ) {
      console.warn("[call][negotiation] ignoring answer in unexpected state", {
        participantId,
        hasPeerConnection: Boolean(pc),
        signalingState: pc?.signalingState,
      });
      return;
    }

    await pc.setRemoteDescription(answer as unknown as LibSessionDescription); // sets the answer send by the participant to remote

    await processPendingIceCandidates({ participantId });
    console.info("[call][negotiation] answer applied", {
      participantId,
      sdp: describeSdp(answer.sdp),
      signalingState: pc.signalingState,
    });
  });
}

// finds the network path between the users in the call
export async function addIceCandidate({
  participantId,
  candidate,
}: {
  participantId: number;
  candidate: RTCIceCandidateInit;
}) {
  const peerConnection = peerConnections.get(participantId);
  if (!peerConnection) {
    const pending = pendingIceCandidates.get(participantId) ?? [];
    pending.push(candidate);
    pendingIceCandidates.set(participantId, pending);
    return;
  }

  return runPeerOperation(participantId, async () => {
    const pc = peerConnections.get(participantId);

    if (pc !== peerConnection) {
      return;
    }

    if (!pc.remoteDescription) {
      const pending = pendingIceCandidates.get(participantId) ?? [];
      pending.push(candidate);
      pendingIceCandidates.set(participantId, pending);
      return;
    }

    await pc.addIceCandidate(candidate as unknown as LibIceCandidate);
  });
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
}): Promise<boolean> {
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

  const addedSenders: {
    peerConnection: RTCPeerConnectionType;
    sender: ReturnType<RTCPeerConnectionType["addTrack"]>;
  }[] = [];
  const reusedSenders: ReturnType<
    RTCPeerConnectionType["getSenders"]
  > = [];
  const currentVideoTrack = localStream.getVideoTracks()[0] ?? null;
  const needsRenegotiation = { value: false };
  try {
    for (const [participantId, peerConnection] of peerConnections) {
      const senders = peerConnection.getSenders();
      const previousScreenSender = screenShareSenders.get(participantId);
      console.info("[call][screen-share] attaching track", {
        participantId,
        mode:
          previousScreenSender &&
          senders.includes(previousScreenSender) &&
          previousScreenSender.track === null
            ? "reuse-screen-sender"
            : "add-screen-track",
        track: describeTrack(track),
        signalingState: peerConnection.signalingState,
      });
      if (
        previousScreenSender &&
        senders.includes(previousScreenSender) &&
        previousScreenSender.track === null
      ) {
        if (track.readyState !== "live") {
          throw new Error("Screen sharing ended before it could start.");
        }
        await previousScreenSender.replaceTrack(track);
        reusedSenders.push(previousScreenSender);
      } else {
        if (track.readyState !== "live") {
          throw new Error("Screen sharing ended before it could start.");
        }
        const sender = peerConnection.addTrack(track, displayStream);
        addedSenders.push({
          peerConnection,
          sender,
        });
        screenShareSenders.set(participantId, sender);
        needsRenegotiation.value = true;
      }
    }
    if (track.readyState !== "live") {
      throw new Error("Screen sharing ended before it could start.");
    }

    for (const peerConnection of peerConnections.values()) {
      await limitSenderBandwidth(peerConnection, track.id);
    }

    console.info("[call][screen-share] tracks attached", {
      peers: peerConnections.size,
      needsRenegotiation: needsRenegotiation.value,
      track: describeTrack(track),
    });
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const sender of reusedSenders) {
      try {
        await sender.replaceTrack(null);
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error
            ? rollbackError.message
            : "A screen-share sender could not be reset.",
        );
      }
    }
    for (const { peerConnection, sender } of addedSenders) {
      peerConnection.removeTrack(sender);
      for (const [participantId, currentPeer] of peerConnections) {
        if (currentPeer === peerConnection) {
          screenShareSenders.delete(participantId);
          break;
        }
      }
    }
    displayStream.getTracks().forEach((displayTrack) => displayTrack.stop());
    const rollbackDetail =
      rollbackErrors.length > 0
        ? ` Screen-share rollback also failed: ${rollbackErrors.join("; ")}`
        : "";
    throw new Error(
      `Could not start screen sharing. ${
        error instanceof Error ? error.message : "Please try again."
      }${rollbackDetail}`,
    );
  }

  previousCameraTrack = currentVideoTrack;
  previousCameraEnabled = currentVideoTrack?.enabled ?? true;
  if (currentVideoTrack) {
    localStream.removeTrack(currentVideoTrack);
  }
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
  return needsRenegotiation.value;
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
  for (const participantId of peerConnections.keys()) {
    const sender = screenShareSenders.get(participantId);
    if (!sender || sender.track?.id !== track?.id) continue;
    console.info("[call][screen-share] detaching track", {
      participantId,
      restoreCamera: cameraIsLive,
      track: describeTrack(track),
    });
    try {
      await sender.replaceTrack(null);
    } catch (error) {
      restorationErrors.push(
        error instanceof Error
          ? error.message
          : "A peer connection could not stop screen sharing.",
      );
    }
  }

  track?.stop();
  screenShareTrack = null;
  screenShareEndedListener = null;
  previousCameraTrack = null;
  previousCameraEnabled = true;

  if (restorationErrors.length > 0) {
    throw new Error(
      `Could not stop screen sharing for every participant: ${restorationErrors.join("; ")}`,
    );
  }
}

export function isScreenSharing(): boolean {
  return screenShareTrack !== null && screenShareTrack.readyState === "live";
}

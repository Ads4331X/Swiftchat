import { sendIceCandidate } from "@/core/socket/call-signaling";
import type { MediaStream as RNMediaStream } from "react-native-webrtc";

import {
  clearAllPeerOperationQueues,
  clearPeerOperationQueue,
  runPeerOperation,
  waitForStableSignalingState,
} from "./call-negotiation";
import { getIceServers, hasTurnCredentials } from "./webrtc-config";
import {
  describeSdp,
  describeTrack,
  logIceCandidateError,
  logPeerState,
  logRemoteTrack,
} from "./call-debug";
import { startCallStatsLogger } from "./call-diagnostics";

export { hasTurnCredentials };

const peerConnections = new Map<number, RTCPeerConnection>();
const stopStatsLoggers = new Map<number, () => void>();
const screenShareSenders = new Map<number, RTCRtpSender>();
let warnedAboutSenderParameterFailure = false;

const pendingIceCandidates = new Map<number, RTCIceCandidateInit[]>();
const politePeerConnections = new Map<number, boolean>();

const audioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: "user",
};

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
  onRemoteStream: (participantId: number, stream: RNMediaStream) => void;
}) {
  if (peerConnections.has(participantId)) {
    return peerConnections.get(participantId);
  }

  const participantPeer = new RTCPeerConnection({
    iceServers: getIceServers(),
  });

  peerConnections.set(participantId, participantPeer);
  stopStatsLoggers.set(
    participantId,
    startCallStatsLogger(participantId, participantPeer),
  );
  politePeerConnections.set(participantId, polite);

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

  participantPeer.onconnectionstatechange = () => {
    logState();
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  participantPeer.oniceconnectionstatechange = () => {
    logState();
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  participantPeer.onsignalingstatechange = logState;
  participantPeer.onicegatheringstatechange = logState;

  participantPeer.onicecandidateerror = (event) => {
    logIceCandidateError({ participantId, callId, event });
  };

  participantPeer.ontrack = (event) => {
    logRemoteTrack({
      participantId,
      callId,
      streams: (event.streams ??
        []) as unknown as readonly RNMediaStream[],
      track: event.track,
    });

    try {
      const stream = handleRemoteTrack({
        event: event as unknown as {
          streams: readonly RNMediaStream[];
          track?: MediaStreamTrack;
        },
      });
      onRemoteStream(participantId, stream);
    } catch (err) {
      console.error("Failed to handle remote track:", err);
    }
  };

  participantPeer.onicecandidate = (event) => {
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

export async function getLocalVideoMedia() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera access requires a secure context. Open the app on https:// or http://localhost.",
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    });
    return stream as unknown as RNMediaStream;
  } catch (err) {
    console.error("Camera getUserMedia failed:", err);
    throw new Error(mediaErrorMessage(err));
  }
}

export async function switchCamera({ stream }: { stream: RNMediaStream }) {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera access requires a secure context. Open the app on https:// or http://localhost.",
    );
  }

  const localStream = stream as unknown as MediaStream;
  const videoTracks = localStream.getVideoTracks();
  const currentTrack = screenShareTrack
    ? previousCameraTrack
    : videoTracks[0];
  if (!currentTrack) {
    throw new Error("Enable your camera before switching cameras.");
  }
  if (!screenShareTrack && videoTracks.length > 1) {
    throw new Error("More than one local video track is active. Restart the call before switching cameras.");
  }

  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === "videoinput",
  );
  if (cameras.length < 2) {
    throw new Error("This device does not have both front and rear cameras.");
  }

  const settings = currentTrack.getSettings();
  const targetFacingMode =
    settings.facingMode === "environment" ? "user" : "environment";
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: { facingMode: { exact: targetFacingMode } },
  };

  let replacementStream: MediaStream;
  try {
    replacementStream =
      await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw new Error(
      `Could not access the other camera. ${mediaErrorMessage(err)}`,
    );
  }

  const replacementTrack = replacementStream.getVideoTracks()[0];
  if (!replacementTrack) {
    replacementStream.getTracks().forEach((track) => track.stop());
    throw new Error("The other camera did not provide a video track.");
  }

  replacementTrack.enabled = currentTrack.enabled;
  const replacedSenders: RTCRtpSender[] = [];

  try {
    for (const peerConnection of peerConnections.values()) {
      for (const sender of peerConnection.getSenders()) {
        if (sender.track?.id !== currentTrack.id) continue;
        await sender.replaceTrack(replacementTrack);
        replacedSenders.push(sender);
      }
    }
  } catch (err) {
    const rollbackErrors: string[] = [];
    for (const sender of replacedSenders) {
      try {
        await sender.replaceTrack(currentTrack);
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error
            ? rollbackError.message
            : "Could not restore a peer connection.",
        );
      }
    }
    replacementStream.getTracks().forEach((track) => track.stop());
    const rollbackMessage =
      rollbackErrors.length > 0
        ? ` Previous camera restoration failed: ${rollbackErrors.join("; ")}`
        : "";
    throw new Error(
      `Could not switch the camera without interrupting the call. ${
        err instanceof Error ? err.message : "Please try again."
      }${rollbackMessage}`,
    );
  }

  if (screenShareTrack) {
    previousCameraTrack = replacementTrack;
    previousCameraEnabled = replacementTrack.enabled;
  } else {
    localStream.removeTrack(currentTrack);
    localStream.addTrack(replacementTrack);
  }
  currentTrack.stop();
}

function getSenderKind(
  peerConnection: RTCPeerConnection,
  sender: RTCRtpSender,
) {
  if (sender.track?.kind) return sender.track.kind;

  try {
    return peerConnection
      .getTransceivers()
      .find((transceiver) => transceiver.sender === sender)?.receiver.track.kind;
  } catch {
    return undefined;
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

  const tracks = webStream.getTracks();
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
    let sender: RTCRtpSender;
    if (inactiveSender) {
      await inactiveSender.replaceTrack(track);
      sender = inactiveSender;
    } else {
      sender = peerConnection.addTrack(track, webStream);
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
  stream: RNMediaStream;
}) {
  const peerConnection = peerConnections.get(participantId);
  if (!peerConnection) return;

  await addLocalTracks({ stream, peerConnection });
}

async function limitSenderBandwidth(peerConnection: RTCPeerConnection) {
  for (const sender of peerConnection.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;

    if (kind === "video" && sender.track?.id === screenShareTrack?.id) {
      await setScreenShareEncodingLimits(sender, true);
      continue;
    }

    try {
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) parameters.encodings = [{}];

      for (const encoding of parameters.encodings) {
        if (kind === "video") {
          encoding.maxBitrate = 2_500_000;
          encoding.maxFramerate = 30;
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
    streams?: readonly RNMediaStream[] | null;
    track?: MediaStreamTrack;
  };
}) {
  const [firstStream] = event.streams ?? [];
  if (firstStream) return firstStream;

  if (event.track) {
    return new MediaStream([event.track]) as unknown as RNMediaStream;
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
    existingTracks.every((track) => {
      const key = track.kind === "video" ? `video:${track.id}` : track.kind;
      return tracksById.get(key) === track;
    })
  ) {
    return existing;
  }

  const merged = new MediaStream();
  for (const track of tracksById.values()) {
    merged.addTrack(track);
  }
  return merged;
}

export function createVideoTrackStream(track: MediaStreamTrack): RNMediaStream {
  return new MediaStream([track]) as unknown as RNMediaStream;
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
  pc.close();

  peerConnections.delete(participantId);
  screenShareSenders.delete(participantId);
  pendingIceCandidates.delete(participantId);
  politePeerConnections.delete(participantId);
  clearPeerOperationQueue(participantId);
}

export function closeAllPeerConnections() {
  for (const stopLogger of stopStatsLoggers.values()) stopLogger();
  stopStatsLoggers.clear();
  for (const [, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();
  screenShareSenders.clear();
  pendingIceCandidates.clear();
  politePeerConnections.clear();
  clearAllPeerOperationQueues();
}

/** Read-only snapshot of active peer connections for diagnostics. */
export function getPeerConnections(): ReadonlyMap<number, RTCPeerConnection> {
  return peerConnections;
}

export async function stopLocalMedia({ stream }: { stream: RNMediaStream }) {
  const webStream = stream as unknown as MediaStream;

  if (screenShareTrack) {
    try {
      await stopScreenShare({ localStream: stream });
    } catch (error) {
      console.warn("Could not restore the camera while ending the call:", error);
    }
  }

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

export function toggleCamera({
  stream,
}: {
  stream: RNMediaStream;
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
    );
    await pc.setLocalDescription(offer);
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

      await pc.setLocalDescription({ type: "rollback" });
    }

    if (pc.signalingState !== "have-remote-offer") {
      await pc.setRemoteDescription(offer);
    }
    await processPendingIceCandidates({ participantId });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
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

    await pc.setRemoteDescription(answer);
    await processPendingIceCandidates({ participantId });
    console.info("[call][negotiation] answer applied", {
      participantId,
      sdp: describeSdp(answer.sdp),
      signalingState: pc.signalingState,
    });
  });
}

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

    await pc.addIceCandidate(candidate);
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
    await pc.addIceCandidate(candidate);
  }
}

export async function startCallAudio(_args: {
  callType: "audio" | "video";
}) {}

export function setCallSpeakerphone(_enabled: boolean) {}

export async function stopCallAudio() {}

// --- Screen sharing (web) ---

let screenShareTrack: MediaStreamTrack | null = null;
let previousCameraTrack: MediaStreamTrack | null = null;
let previousCameraEnabled = true;
const previousScreenShareEncodingLimits = new Map<
  RTCRtpSender,
  {
    encodings: { maxBitrate?: number; maxFramerate?: number }[];
    degradationPreference?: RTCRtpSendParameters["degradationPreference"];
  }
>();

export async function startScreenShare({
  localStream,
  onStopped,
}: {
  localStream: RNMediaStream;
  onStopped?: () => void;
}): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getDisplayMedia
  ) {
    throw new Error(
      "Screen sharing is only available in browsers that support getDisplayMedia.",
    );
  }

  if (screenShareTrack) {
    throw new Error("Screen sharing is already active.");
  }

  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1280, max: 1920 },
      frameRate: { ideal: 15, max: 20 },
    },
    audio: false,
  });

  const track = displayStream.getVideoTracks()[0];
  if (!track) {
    displayStream.getTracks().forEach((t) => t.stop());
    throw new Error("No screen share track was provided.");
  }

  const webLocalStream = localStream as unknown as MediaStream;
  const currentVideoTrack = webLocalStream.getVideoTracks()[0] ?? null;
  const addedSenders: {
    peerConnection: RTCPeerConnection;
    sender: RTCRtpSender;
  }[] = [];
  const reusedSenders: RTCRtpSender[] = [];
  let needsRenegotiation = false;
  try {
    for (const [participantId, peerConnection] of peerConnections) {
      const senders = peerConnection.getSenders();
      const previousScreenSender = screenShareSenders.get(participantId);
      const canReuseScreenSender = Boolean(
        previousScreenSender &&
          senders.includes(previousScreenSender) &&
          previousScreenSender.track === null,
      );
      console.info("[call][screen-share] attaching track", {
        participantId,
        mode: canReuseScreenSender ? "reuse-screen-sender" : "add-screen-track",
        track: describeTrack(track),
        signalingState: peerConnection.signalingState,
      });
      if (canReuseScreenSender && previousScreenSender) {
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
        needsRenegotiation = true;
      }
    }

    for (const peerConnection of peerConnections.values()) {
      for (const sender of peerConnection.getSenders()) {
        if (sender.track?.id !== track.id) continue;
        await setScreenShareEncodingLimits(sender, true);
      }
    }

    if (track.readyState !== "live") {
      throw new Error("Screen sharing ended before it could start.");
    }

    console.info("[call][screen-share] tracks attached", {
      peers: peerConnections.size,
      needsRenegotiation,
      track: describeTrack(track),
    });
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const sender of reusedSenders) {
      try {
        await sender.replaceTrack(null);
        await setScreenShareEncodingLimits(sender, false);
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
    webLocalStream.removeTrack(currentVideoTrack);
  }
  webLocalStream.addTrack(track);
  screenShareTrack = track;

  track.onended = () => {
    void stopScreenShare({ localStream }).then(
      () => onStopped?.(),
      (error: unknown) => {
        console.error("Could not restore the camera after screen sharing:", error);
        onStopped?.();
      },
    );
  };
  return needsRenegotiation;
}

export async function stopScreenShare({
  localStream,
}: {
  localStream: RNMediaStream;
}): Promise<void> {
  const webLocalStream = localStream as unknown as MediaStream;
  const track = screenShareTrack;
  const cameraTrack = previousCameraTrack;

  if (track) {
    track.onended = null;
    webLocalStream.removeTrack(track);
  }

  const restorationErrors: string[] = [];
  const cameraIsLive = cameraTrack?.readyState === "live";
  if (cameraIsLive && cameraTrack) {
    cameraTrack.enabled = previousCameraEnabled;
    webLocalStream.addTrack(cameraTrack);
  }

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
    await setScreenShareEncodingLimits(sender, false);
  }

  track?.stop();
  screenShareTrack = null;
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

async function setScreenShareEncodingLimits(
  sender: RTCRtpSender,
  sharingScreen: boolean,
) {
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];

    if (sharingScreen) {
      previousScreenShareEncodingLimits.set(sender, {
        encodings: parameters.encodings.map((encoding) => ({
          maxBitrate: encoding.maxBitrate,
          maxFramerate: encoding.maxFramerate,
        })),
        degradationPreference: parameters.degradationPreference,
      });
      for (const encoding of parameters.encodings) {
        encoding.maxBitrate = 1_500_000;
        encoding.maxFramerate = 15;
      }
      parameters.degradationPreference = "balanced";
    } else {
      const previous = previousScreenShareEncodingLimits.get(sender);
      if (!previous) return;
      parameters.encodings.forEach((encoding, index) => {
        const previousEncoding = previous.encodings[index];
        if (!previousEncoding) return;
        if (previousEncoding.maxBitrate === undefined) {
          delete encoding.maxBitrate;
        } else {
          encoding.maxBitrate = previousEncoding.maxBitrate;
        }
        if (previousEncoding.maxFramerate === undefined) {
          delete encoding.maxFramerate;
        } else {
          encoding.maxFramerate = previousEncoding.maxFramerate;
        }
      });
      parameters.degradationPreference = previous.degradationPreference;
    }

    await sender.setParameters(parameters);
    if (!sharingScreen) previousScreenShareEncodingLimits.delete(sender);
  } catch (error) {
    console.warn("Could not adjust screen-share video quality:", error);
  }
}

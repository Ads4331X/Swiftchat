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
  width: { ideal: 720, max: 1280 },
  height: { ideal: 1280, max: 1280 },
  frameRate: { ideal: 30, max: 30 },
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

  const participantPeer = new RTCPeerConnection({ iceServers });

  peerConnections.set(participantId, participantPeer);

  participantPeer.onconnectionstatechange = () => {
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  participantPeer.oniceconnectionstatechange = () => {
    onConnectionStateChange(
      participantPeer.connectionState,
      participantPeer.iceConnectionState,
      participantId,
    );
  };

  participantPeer.onicecandidateerror = (event) => {
    console.warn("WebRTC ICE candidate error:", {
      code: event.errorCode,
      message: event.errorText,
      server: event.url,
    });
  };

  participantPeer.ontrack = (event) => {
    try {
      const stream = handleRemoteTrack({
        event: event as unknown as { streams: readonly RNMediaStream[] },
      });
      onRemoteStream(participantId, stream);
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

export function hasTurnCredentials() {
  return Boolean(
    process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() &&
      process.env.EXPO_PUBLIC_TURN_CREDENTIAL?.trim(),
  );
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
  const [currentTrack, ...duplicateTracks] = localStream.getVideoTracks();
  if (!currentTrack) {
    throw new Error("Enable your camera before switching cameras.");
  }
  if (duplicateTracks.length > 0) {
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

  localStream.removeTrack(currentTrack);
  localStream.addTrack(replacementTrack);
  currentTrack.stop();
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
    if (
      peerConnection
        .getSenders()
        .some((sender) => sender.track?.id === track.id)
    ) {
      continue;
    }

    peerConnection.addTrack(track, webStream);
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
}): Promise<void> {
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
  if (!currentVideoTrack || currentVideoTrack.readyState !== "live") {
    displayStream.getTracks().forEach((displayTrack) => displayTrack.stop());
    throw new Error("Start a video call before sharing your screen.");
  }

  const replacedSenders: RTCRtpSender[] = [];
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

    for (const peerConnection of peerConnections.values()) {
      for (const sender of peerConnection.getSenders()) {
        if (sender.track?.id !== track.id) continue;
        await setScreenShareEncodingLimits(sender, true);
      }
    }

    if (track.readyState !== "live") {
      throw new Error("Screen sharing ended before it could start.");
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const sender of replacedSenders) {
      try {
        await sender.replaceTrack(currentVideoTrack);
        await setScreenShareEncodingLimits(sender, false);
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
  webLocalStream.removeTrack(currentVideoTrack);
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
  if (cameraTrack && cameraTrack.readyState !== "ended") {
    cameraTrack.enabled = previousCameraEnabled;
    webLocalStream.addTrack(cameraTrack);

    for (const peerConnection of peerConnections.values()) {
      for (const sender of peerConnection.getSenders()) {
        if (sender.track?.id !== track?.id) continue;
        try {
          await sender.replaceTrack(cameraTrack);
        } catch (error) {
          restorationErrors.push(
            error instanceof Error
              ? error.message
              : "A peer connection could not restore the camera.",
          );
        }
        await setScreenShareEncodingLimits(sender, false);
      }
    }
  }

  track?.stop();
  screenShareTrack = null;
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

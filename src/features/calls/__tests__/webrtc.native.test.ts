import type { MediaStream as RNMediaStream } from "react-native-webrtc";
import { Platform } from "react-native";
import { getWebRTC } from "../webrtc-module";
import {
  closeAllPeerConnections,
  createPeerConnection,
  startScreenShare,
  stopScreenShare,
} from "../webrtc.native";

jest.mock("@/core/socket/call-signaling", () => ({
  sendIceCandidate: jest.fn(),
}));

jest.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "android" },
}));

jest.mock("expo-audio", () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock("react-native-incall-manager", () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setForceSpeakerphoneOn: jest.fn(),
  setSpeakerphoneOn: jest.fn(),
  setKeepScreenOn: jest.fn(),
}));

jest.mock("../webrtc-module", () => ({
  getWebRTC: jest.fn(),
}));

type MockTrack = {
  id: string;
  kind: "audio" | "video";
  enabled: boolean;
  readyState: string;
  stop: jest.Mock;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
};

function makeTrack(kind: "audio" | "video", id: string): MockTrack {
  return {
    id,
    kind,
    enabled: true,
    readyState: "live",
    stop: jest.fn(function (this: MockTrack) {
      this.readyState = "ended";
    }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
}

function makeStream(tracks: MockTrack[]) {
  let currentTracks = [...tracks];
  return {
    getTracks: () => [...currentTracks],
    getVideoTracks: () => currentTracks.filter((track) => track.kind === "video"),
    getAudioTracks: () => currentTracks.filter((track) => track.kind === "audio"),
    addTrack: jest.fn((track: MockTrack) => {
      if (!currentTracks.includes(track)) currentTracks.push(track);
    }),
    removeTrack: jest.fn((track: MockTrack) => {
      currentTracks = currentTracks.filter((current) => current !== track);
    }),
  } as unknown as RNMediaStream;
}

class MockPeerConnection {
  connectionState = "new";
  iceConnectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicecandidateerror: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  readonly senders: {
    track: MockTrack;
    replaceTrack: jest.Mock;
  }[] = [];

  getSenders() {
    return this.senders;
  }

  close() {}
}

describe("native Android screen sharing", () => {
  const originalPlatformOS = Object.getOwnPropertyDescriptor(Platform, "OS");
  let cameraTrack: MockTrack;
  let displayTrack: MockTrack;
  let localStream: RNMediaStream;
  let sender: { track: MockTrack; replaceTrack: jest.Mock };
  let endedListener: (() => void) | undefined;

  beforeAll(() => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "android",
    });
  });

  beforeEach(() => {
    closeAllPeerConnections();
    jest.clearAllMocks();
    cameraTrack = makeTrack("video", "camera");
    displayTrack = makeTrack("video", "display");
    localStream = makeStream([makeTrack("audio", "microphone"), cameraTrack]);
    endedListener = undefined;
    displayTrack.addEventListener.mockImplementation(
      (_event: string, listener: () => void) => {
        endedListener = listener;
      },
    );
    const getDisplayMedia = jest.fn().mockResolvedValue(makeStream([displayTrack]));
    (getWebRTC as jest.Mock).mockReturnValue({
      RTCPeerConnection: MockPeerConnection,
      mediaDevices: { getDisplayMedia },
    });
    const peer = createPeerConnection({
      participantId: 3,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    sender = {
      track: cameraTrack,
      replaceTrack: jest.fn(async (nextTrack: MockTrack) => {
        sender.track = nextTrack;
      }),
    };
    peer.senders.push(sender);
  });

  afterEach(() => {
    closeAllPeerConnections();
  });

  afterAll(() => {
    if (originalPlatformOS) {
      Object.defineProperty(Platform, "OS", originalPlatformOS);
    }
  });

  it("replaces only the camera video and restores its previous state", async () => {
    await startScreenShare({ localStream });

    expect(sender.replaceTrack).toHaveBeenCalledWith(displayTrack);
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    expect(cameraTrack.enabled).toBe(false);

    await stopScreenShare({ localStream });

    expect(sender.replaceTrack).toHaveBeenLastCalledWith(cameraTrack);
    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(cameraTrack.enabled).toBe(true);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("restores the camera when Android ends screen capture", async () => {
    const onStopped = jest.fn();
    await startScreenShare({ localStream, onStopped });
    displayTrack.readyState = "ended";
    endedListener?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(cameraTrack);
  });

  it("keeps a camera that was already off disabled after sharing stops", async () => {
    cameraTrack.enabled = false;

    await startScreenShare({ localStream });
    await stopScreenShare({ localStream });

    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(cameraTrack.enabled).toBe(false);
  });

  it("stops capture and leaves the camera intact if no video sender exists", async () => {
    closeAllPeerConnections();

    await expect(startScreenShare({ localStream })).rejects.toThrow(
      /no active video connection/i,
    );
    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
  });
});

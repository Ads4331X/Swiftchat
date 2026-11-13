import type {
  MediaStream as RNMediaStream,
  MediaStreamTrack as RNMediaStreamTrack,
} from "react-native-webrtc";
import { Platform } from "react-native";
import { getWebRTC } from "../webrtc-module";
import {
  addLocalTracks,
  closeAllPeerConnections,
  createPeerConnection,
  getLocalMedia,
  getPeerConnections,
  handleRemoteTrack,
  mergeRemoteStreams,
  startScreenShare,
  stopScreenShare,
  toggleCamera,
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

type MockSender = {
  track: MockTrack | null;
  replaceTrack: jest.Mock;
  parameters: {
    encodings: { maxBitrate?: number; maxFramerate?: number }[];
    degradationPreference?: string;
  };
  getParameters: jest.Mock;
  setParameters: jest.Mock;
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

function makeSender(track: MockTrack): MockSender {
  let sender: MockSender;
  sender = {
    track,
    replaceTrack: jest.fn(async (nextTrack: MockTrack | null) => {
      sender.track = nextTrack;
    }),
    parameters: { encodings: [{}], degradationPreference: "balanced" },
    getParameters: jest.fn(() => ({
      ...sender.parameters,
      encodings: sender.parameters.encodings.map((encoding) => ({
        ...encoding,
      })),
    })),
    setParameters: jest.fn(async (parameters: MockSender["parameters"]) => {
      sender.parameters = parameters;
    }),
  };
  return sender;
}

class MockPeerConnection {
  connectionState = "new";
  iceConnectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicecandidateerror: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  readonly senders: MockSender[] = [];

  getSenders() {
    return this.senders;
  }

  addTrack(track: MockTrack) {
    const sender = makeSender(track);
    this.senders.push(sender);
    return sender;
  }

  removeTrack(sender: (typeof this.senders)[number]) {
    const index = this.senders.indexOf(sender);
    if (index !== -1) this.senders.splice(index, 1);
  }

  close() {}
}

describe("native Android screen sharing", () => {
  const originalPlatformOS = Object.getOwnPropertyDescriptor(Platform, "OS");
  let cameraTrack: MockTrack;
  let displayTrack: MockTrack;
  let localStream: RNMediaStream;
  let sender: MockSender;
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
    sender = makeSender(cameraTrack);
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

  it("keeps the camera sender and adds a separate screen sender", async () => {
    await expect(startScreenShare({ localStream })).resolves.toBe(true);

    const peer = getPeerConnections().get(3) as unknown as MockPeerConnection;
    const screenSender = peer.senders.find(
      (candidate) => candidate.track === displayTrack,
    );
    expect(screenSender).toBeDefined();
    expect(sender.replaceTrack).not.toHaveBeenCalled();
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    expect(cameraTrack.enabled).toBe(true);

    await stopScreenShare({ localStream });

    expect(screenSender?.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(cameraTrack.enabled).toBe(true);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("requests landscape 720p capture with a 1080p maximum", async () => {
    const getUserMedia = jest.fn().mockResolvedValue(localStream);
    (getWebRTC as jest.Mock).mockReturnValue({
      RTCPeerConnection: MockPeerConnection,
      mediaDevices: { getUserMedia },
    });

    await getLocalMedia({ callType: "video" });

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        }),
      }),
    );
  });

  it("toggles the camera independently while screen sharing", async () => {
    await startScreenShare({ localStream });

    expect(toggleCamera({ stream: localStream })).toBe(false);
    expect(cameraTrack.enabled).toBe(false);
    expect(displayTrack.enabled).toBe(true);
    expect(toggleCamera({ stream: localStream })).toBe(true);

    await stopScreenShare({ localStream });

    expect(cameraTrack.enabled).toBe(true);
  });

  it("caps native camera senders while retaining adaptive degradation", async () => {
    await addLocalTracks({
      stream: localStream,
      peerConnection: getPeerConnections().get(3)!,
    });

    expect(sender.setParameters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        encodings: [
          expect.objectContaining({
            maxBitrate: 2_500_000,
            maxFramerate: 30,
          }),
        ],
        degradationPreference: "balanced",
      }),
    );
  });

  it("restores the camera when Android ends screen capture", async () => {
    const onStopped = jest.fn();
    await startScreenShare({ localStream, onStopped });
    displayTrack.readyState = "ended";
    endedListener?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(sender.replaceTrack).not.toHaveBeenCalled();
  });

  it("keeps a camera that was already off disabled after sharing stops", async () => {
    cameraTrack.enabled = false;

    await startScreenShare({ localStream });
    await stopScreenShare({ localStream });

    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(cameraTrack.enabled).toBe(false);
  });

  it("shares an audio-only call without enabling or replacing a camera", async () => {
    const microphone = makeTrack("audio", "microphone");
    localStream = makeStream([microphone]);
    closeAllPeerConnections();
    const connection = createPeerConnection({
      participantId: 4,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const audioSender = makeSender(microphone);
    connection.senders.push(audioSender);

    await expect(startScreenShare({ localStream })).resolves.toBe(true);

    expect(connection.senders).toHaveLength(2);
    expect(connection.senders[1].track).toBe(displayTrack);
    expect(localStream.getAudioTracks()).toEqual([microphone]);
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    expect(microphone.enabled).toBe(true);

    await stopScreenShare({ localStream });

    expect(connection.senders[1].track).toBeNull();
    expect(localStream.getAudioTracks()).toEqual([microphone]);
    expect(localStream.getVideoTracks()).toEqual([]);
    expect(microphone.enabled).toBe(true);
  });

  it("allows capture to start before a peer connection is available", async () => {
    closeAllPeerConnections();

    await expect(startScreenShare({ localStream })).resolves.toBe(false);
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    await stopScreenShare({ localStream });
    expect(localStream.getVideoTracks()).toEqual([cameraTrack]);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
  });
});

describe("native remote stream merging", () => {
  class MockMediaStream {
    private currentTracks: MockTrack[];

    constructor(tracks: MockTrack[] = []) {
      this.currentTracks = [...tracks];
    }

    getTracks() {
      return [...this.currentTracks];
    }

    addTrack(track: MockTrack) {
      this.currentTracks.push(track);
    }
  }

  beforeAll(() => {
    (getWebRTC as jest.Mock).mockReturnValue({
      MediaStream: MockMediaStream,
    });
  });

  it("preserves different video tracks from the same participant", () => {
    const microphone = makeTrack("audio", "microphone");
    const oldCamera = makeTrack("video", "old-camera");
    const screen = makeTrack("video", "screen");
    const existing = new MockMediaStream([
      microphone,
      oldCamera,
    ]) as unknown as RNMediaStream;
    const incoming = new MockMediaStream([screen]) as unknown as RNMediaStream;

    const merged = mergeRemoteStreams(
      existing,
      incoming,
    ) as unknown as MockMediaStream;

    expect(merged.getTracks()).toEqual([microphone, oldCamera, screen]);
  });

  it("builds a stream when the remote track has no associated stream", () => {
    const screen = makeTrack("video", "screen");

    const stream = handleRemoteTrack({
      event: {
        streams: undefined,
        track: screen as unknown as RNMediaStreamTrack,
      },
    }) as unknown as MockMediaStream;

    expect(stream.getTracks()).toEqual([screen]);
  });
});

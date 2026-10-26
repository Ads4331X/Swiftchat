import type { MediaStream as RNMediaStream } from "react-native-webrtc";
import {
  addLocalTracks,
  closeAllPeerConnections,
  createPeerConnection,
  startScreenShare,
  stopLocalMedia,
  stopScreenShare,
} from "../webrtc.web";

jest.mock("@/core/socket/call-signaling", () => ({
  sendIceCandidate: jest.fn(),
}));

type MockTrack = MediaStreamTrack & { stop: jest.Mock };

function makeTrack(kind: "audio" | "video", label: string): MockTrack {
  const track = {
    id: `${label}-id`,
    kind,
    label,
    enabled: true,
    readyState: "live",
    onended: null,
    stop: jest.fn(function (this: { readyState: string }) {
      this.readyState = "ended";
    }),
    getSettings: () => ({ width: 1920, height: 1080 }),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  return track as unknown as MockTrack;
}

function makeStream(tracks: MockTrack[]) {
  let streamTracks = [...tracks];
  return {
    getTracks: () => [...streamTracks],
    getAudioTracks: () => streamTracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => streamTracks.filter((track) => track.kind === "video"),
    addTrack: jest.fn((track: MockTrack) => {
      if (!streamTracks.includes(track)) streamTracks.push(track);
    }),
    removeTrack: jest.fn((track: MockTrack) => {
      streamTracks = streamTracks.filter((item) => item !== track);
    }),
  } as unknown as RNMediaStream;
}

function makeSender(track: MockTrack) {
  let limits = {
    encodings: [{ maxBitrate: 850_000, maxFramerate: 30 }],
    degradationPreference: "balanced",
  };
  return {
    get track() {
      return track;
    },
    replaceTrack: jest.fn(async (nextTrack: MockTrack) => {
      track = nextTrack;
    }),
    getParameters: jest.fn(() => ({
      ...limits,
      encodings: limits.encodings.map((encoding) => ({ ...encoding })),
    })),
    setParameters: jest.fn(async (nextLimits) => {
      limits = nextLimits;
    }),
  };
}

class MockPeerConnection {
  connectionState = "new";
  iceConnectionState = "new";
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicecandidateerror: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  readonly senders: ReturnType<typeof makeSender>[] = [];

  getSenders() {
    return this.senders;
  }

  addTrack(track: MockTrack) {
    this.senders.push(makeSender(track));
  }

  close() {}
}

describe("web screen sharing", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  let getDisplayMedia: jest.Mock;
  let displayTrack: MockTrack;

  beforeEach(() => {
    closeAllPeerConnections();
    jest.clearAllMocks();
    displayTrack = makeTrack("video", "screen:0:0");
    getDisplayMedia = jest.fn().mockResolvedValue(makeStream([displayTrack]));
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { mediaDevices: { getDisplayMedia } },
    });
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: MockPeerConnection,
    });
  });

  afterAll(() => {
    closeAllPeerConnections();
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
    Reflect.deleteProperty(globalThis, "RTCPeerConnection");
  });

  it("caps screen capture and restores the camera track and encoding limits", async () => {
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([makeTrack("audio", "microphone"), camera]);
    const peer = createPeerConnection({
      participantId: 1,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const sender = makeSender(camera);
    peer.senders.push(sender);

    await startScreenShare({ localStream });

    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280, max: 1920 },
        frameRate: { ideal: 15, max: 20 },
      },
      audio: false,
    });
    expect(sender.replaceTrack).toHaveBeenCalledWith(displayTrack);
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    expect(camera.enabled).toBe(false);
    expect(sender.setParameters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        encodings: [
          expect.objectContaining({
            maxBitrate: 1_500_000,
            maxFramerate: 15,
          }),
        ],
      }),
    );

    await stopScreenShare({ localStream });

    expect(sender.replaceTrack).toHaveBeenLastCalledWith(camera);
    expect(localStream.getVideoTracks()).toEqual([camera]);
    expect(camera.enabled).toBe(true);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
    expect(sender.setParameters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        encodings: [
          expect.objectContaining({
            maxBitrate: 850_000,
            maxFramerate: 30,
          }),
        ],
      }),
    );
  });

  it("restores the camera when the browser stop-sharing control is used", async () => {
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([camera]);
    const peer = createPeerConnection({
      participantId: 2,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const sender = makeSender(camera);
    peer.senders.push(sender);
    const onStopped = jest.fn();

    await startScreenShare({ localStream, onStopped });
    displayTrack.onended?.(new Event("ended"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(localStream.getVideoTracks()).toEqual([camera]);
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(camera);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("stops screen capture and the restored camera when the call ends", async () => {
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([camera]);
    const peer = createPeerConnection({
      participantId: 5,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const sender = makeSender(camera);
    peer.senders.push(sender);

    await startScreenShare({ localStream });
    await stopLocalMedia({ stream: localStream });

    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(sender.replaceTrack).toHaveBeenLastCalledWith(camera);
  });

  it("applies and restores screen limits for peers added while sharing", async () => {
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([
      makeTrack("audio", "microphone"),
      camera,
    ]);

    await startScreenShare({ localStream });

    const peer = new MockPeerConnection();
    await addLocalTracks({
      stream: localStream as unknown as RNMediaStream,
      peerConnection: peer as unknown as RTCPeerConnection,
    });

    const screenSender = peer.senders.find(
      (sender) => sender.track.id === displayTrack.id,
    );
    expect(screenSender).toBeDefined();
    expect(screenSender?.setParameters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        encodings: [
          expect.objectContaining({
            maxBitrate: 1_500_000,
            maxFramerate: 15,
          }),
        ],
      }),
    );

    const nativePeer = createPeerConnection({
      participantId: 6,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    nativePeer.senders.push(...peer.senders);
    await stopScreenShare({ localStream });

    expect(screenSender?.track).toBe(camera);
    expect(screenSender?.setParameters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        encodings: [
          expect.objectContaining({
            maxBitrate: 850_000,
            maxFramerate: 30,
          }),
        ],
      }),
    );
  });

  it("stops capture and rolls back senders when replacement fails", async () => {
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([camera]);
    const firstPeer = createPeerConnection({
      participantId: 3,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const secondPeer = createPeerConnection({
      participantId: 4,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const firstSender = makeSender(camera);
    const secondSender = makeSender(camera);
    secondSender.replaceTrack.mockRejectedValueOnce(new Error("replace failed"));
    firstPeer.senders.push(firstSender);
    secondPeer.senders.push(secondSender);

    await expect(startScreenShare({ localStream })).rejects.toThrow(
      /could not start screen sharing/i,
    );

    expect(firstSender.replaceTrack).toHaveBeenLastCalledWith(camera);
    expect(localStream.getVideoTracks()).toEqual([camera]);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("leaves the call unchanged when screen capture is cancelled", async () => {
    const localStream = makeStream([makeTrack("video", "camera")]);
    const cancellation = new DOMException("Selection cancelled", "AbortError");
    getDisplayMedia.mockRejectedValueOnce(cancellation);

    await expect(startScreenShare({ localStream })).rejects.toBe(cancellation);
    expect(localStream.getVideoTracks()[0].label).toBe("camera");
  });
});

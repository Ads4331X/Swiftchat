import type { MediaStream as RNMediaStream } from "react-native-webrtc";
import {
  addLocalTracks,
  closeAllPeerConnections,
  createAnswer,
  getLocalMedia,
  createPeerConnection,
  handleAnswer,
  handleRemoteTrack,
  mergeRemoteStreams,
  startScreenShare,
  switchCamera,
  stopLocalMedia,
  stopScreenShare,
  toggleCamera,
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
  const kind = track.kind;
  let currentTrack: MockTrack | null = track;
  let limits = {
    encodings: [{ maxBitrate: 850_000, maxFramerate: 30 }],
    degradationPreference: "balanced",
  };
  return {
    kind,
    get track() {
      return currentTrack;
    },
    replaceTrack: jest.fn(async (nextTrack: MockTrack | null) => {
      currentTrack = nextTrack;
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
  signalingState: RTCSignalingState = "stable";
  remoteDescription: RTCSessionDescription | null = null;
  localDescription: RTCSessionDescription | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicecandidateerror: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;
  readonly senders: ReturnType<typeof makeSender>[] = [];

  getSenders() {
    return this.senders;
  }

  getTransceivers() {
    return this.senders.map((sender) => ({
      sender,
      receiver: { track: { kind: sender.kind } },
    }));
  }

  addTrack(track: MockTrack) {
    const sender = makeSender(track);
    this.senders.push(sender);
    return sender;
  }

  removeTrack(sender: ReturnType<typeof makeSender>) {
    const index = this.senders.indexOf(sender);
    if (index !== -1) this.senders.splice(index, 1);
  }

  async createOffer() {
    return { type: "offer" as const, sdp: "offer" };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "answer" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description as RTCSessionDescription;
    if (description.type === "rollback") {
      this.signalingState = "stable";
    } else if (description.type === "offer") {
      this.signalingState = "have-local-offer";
    } else if (description.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description as RTCSessionDescription;
    if (description.type === "offer") {
      this.signalingState = "have-remote-offer";
    } else if (description.type === "answer") {
      this.signalingState = "stable";
    }
  }

  async addIceCandidate(_candidate: RTCIceCandidateInit) {}

  close() {}
}

describe("remote stream merging", () => {
  const originalMediaStream = Object.getOwnPropertyDescriptor(
    globalThis,
    "MediaStream",
  );

  class MockMediaStream {
    private tracks: MockTrack[];

    constructor(tracks: MockTrack[] = []) {
      this.tracks = [...tracks];
    }

    getTracks() {
      return [...this.tracks];
    }

    getAudioTracks() {
      return this.tracks.filter((track) => track.kind === "audio");
    }

    getVideoTracks() {
      return this.tracks.filter((track) => track.kind === "video");
    }

    addTrack(track: MockTrack) {
      this.tracks.push(track);
    }
  }

  beforeAll(() => {
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: MockMediaStream,
    });
  });

  afterAll(() => {
    if (originalMediaStream) {
      Object.defineProperty(globalThis, "MediaStream", originalMediaStream);
    } else {
      Reflect.deleteProperty(globalThis, "MediaStream");
    }
  });

  it("preserves different video tracks from the same participant", () => {
    const microphone = makeTrack("audio", "microphone");
    const oldCamera = makeTrack("video", "old-camera");
    const newCamera = makeTrack("video", "screen");
    const existing = new MockMediaStream([
      microphone,
      oldCamera,
    ]) as unknown as MediaStream;
    const incoming = new MockMediaStream([newCamera]) as unknown as MediaStream;

    const merged = mergeRemoteStreams(existing, incoming) as unknown as MockMediaStream;

    expect(merged.getAudioTracks()).toEqual([microphone]);
    expect(merged.getVideoTracks()).toEqual([oldCamera, newCamera]);
  });

  it("builds a stream when the remote track has no associated stream", () => {
    const screen = makeTrack("video", "screen");

    const stream = handleRemoteTrack({
      event: {
        streams: undefined,
        track: screen,
      },
    }) as unknown as MockMediaStream;

    expect(stream.getTracks()).toEqual([screen]);
  });

  it("keeps existing tracks when the incoming stream only contains another kind", () => {
    const oldMicrophone = makeTrack("audio", "old-microphone");
    const camera = makeTrack("video", "camera");
    const newMicrophone = makeTrack("audio", "new-microphone");
    const existing = new MockMediaStream([
      oldMicrophone,
      camera,
    ]) as unknown as MediaStream;
    const incoming = new MockMediaStream([
      newMicrophone,
    ]) as unknown as MediaStream;

    const merged = mergeRemoteStreams(existing, incoming) as unknown as MockMediaStream;

    expect(merged.getAudioTracks()).toEqual([newMicrophone]);
    expect(merged.getVideoTracks()).toEqual([camera]);
  });
});

describe("web screen sharing", () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  let getDisplayMedia: jest.Mock;
  let getUserMedia: jest.Mock;
  let displayTrack: MockTrack;

  beforeEach(() => {
    closeAllPeerConnections();
    jest.clearAllMocks();
    displayTrack = makeTrack("video", "screen:0:0");
    getDisplayMedia = jest.fn().mockResolvedValue(makeStream([displayTrack]));
    getUserMedia = jest.fn().mockResolvedValue(makeStream([]));
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { mediaDevices: { getDisplayMedia, getUserMedia } },
    });
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: MockPeerConnection,
    });
  });

  it("requests landscape 720p video with a 1080p device ceiling", async () => {
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
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([camera]);
    await startScreenShare({ localStream });

    expect(toggleCamera({ stream: localStream })).toBe(false);
    expect(camera.enabled).toBe(false);
    expect(displayTrack.enabled).toBe(true);
    expect(toggleCamera({ stream: localStream })).toBe(true);

    await stopScreenShare({ localStream });

    expect(camera.enabled).toBe(true);
  });

  it("switches cameras without replacing the remote screen-share track", async () => {
    const camera = makeTrack("video", "camera");
    const replacement = makeTrack("video", "replacement-camera");
    const localStream = makeStream([camera]);
    const peer = createPeerConnection({
      participantId: 12,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    await addLocalTracks({
      stream: localStream as unknown as RNMediaStream,
      peerConnection: peer as unknown as RTCPeerConnection,
    });
    getUserMedia.mockResolvedValue(makeStream([replacement]));
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        mediaDevices: {
          getDisplayMedia,
          getUserMedia,
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: "videoinput" },
            { kind: "videoinput" },
          ]),
        },
      },
    });
    await startScreenShare({ localStream });

    await switchCamera({ stream: localStream });

    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    await stopScreenShare({ localStream });
    expect(localStream.getVideoTracks()).toEqual([replacement]);
  });

  it("caps the camera sender while preserving adaptive degradation", async () => {
    const camera = makeTrack("video", "camera");
    const peer = createPeerConnection({
      participantId: 11,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;

    await addLocalTracks({
      stream: makeStream([camera]) as unknown as RNMediaStream,
      peerConnection: peer as unknown as RTCPeerConnection,
    });

    expect(peer.senders[0].setParameters).toHaveBeenLastCalledWith(
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

  afterAll(() => {
    closeAllPeerConnections();
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
    Reflect.deleteProperty(globalThis, "RTCPeerConnection");
  });

  it("keeps the camera sender and adds a separately capped screen sender", async () => {
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

    await expect(startScreenShare({ localStream })).resolves.toBe(true);

    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280, max: 1920 },
        frameRate: { ideal: 15, max: 20 },
      },
      audio: false,
    });
    const screenSender = peer.senders.find(
      (candidate) => candidate.track?.id === displayTrack.id,
    );
    expect(screenSender).toBeDefined();
    expect(sender.replaceTrack).not.toHaveBeenCalled();
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    expect(camera.enabled).toBe(true);
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

    await stopScreenShare({ localStream });

    expect(screenSender?.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(localStream.getVideoTracks()).toEqual([camera]);
    expect(camera.enabled).toBe(true);
    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
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
    const screenSender = peer.senders.find(
      (candidate) => candidate.track?.id === displayTrack.id,
    );
    displayTrack.onended?.(new Event("ended"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onStopped).toHaveBeenCalledTimes(1);
    expect(localStream.getVideoTracks()).toEqual([camera]);
    expect(screenSender?.replaceTrack).toHaveBeenLastCalledWith(null);
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
    const screenSender = peer.senders.find(
      (candidate) => candidate.track?.id === displayTrack.id,
    );
    await stopLocalMedia({ stream: localStream });

    expect(displayTrack.stop).toHaveBeenCalledTimes(1);
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(screenSender?.replaceTrack).toHaveBeenLastCalledWith(null);
  });

  it("applies and restores screen limits for peers added while sharing", async () => {
    const camera = makeTrack("video", "camera");
    const localStream = makeStream([
      makeTrack("audio", "microphone"),
      camera,
    ]);

    await startScreenShare({ localStream });

    const peer = createPeerConnection({
      participantId: 6,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    await addLocalTracks({
      stream: localStream as unknown as RNMediaStream,
      peerConnection: peer as unknown as RTCPeerConnection,
    });

    const screenSender = peer.senders.find(
      (sender) => sender.track?.id === displayTrack.id,
    );
    expect(screenSender).toBeDefined();
    expect(
      peer.senders.some((sender) => sender.track?.id === camera.id),
    ).toBe(true);
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

    await stopScreenShare({ localStream });

    expect(screenSender?.track).toBeNull();
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

  it("stops capture and rolls back screen senders when adding fails", async () => {
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
    firstPeer.senders.push(firstSender);
    secondPeer.senders.push(secondSender);
    jest.spyOn(secondPeer, "addTrack").mockImplementationOnce(() => {
      throw new Error("add failed");
    });

    await expect(startScreenShare({ localStream })).rejects.toThrow(
      /could not start screen sharing/i,
    );

    expect(firstSender.replaceTrack).not.toHaveBeenCalled();
    expect(firstPeer.senders).toEqual([firstSender]);
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

  it("shares an audio-only call without reusing the screen sender for camera", async () => {
    const microphone = makeTrack("audio", "microphone");
    const localStream = makeStream([microphone]);
    const peer = createPeerConnection({
      participantId: 7,
      callId: "call",
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    const audioSender = peer.addTrack(microphone);

    await expect(startScreenShare({ localStream })).resolves.toBe(true);

    expect(peer.senders).toHaveLength(2);
    const screenSender = peer.senders.find(
      (sender) => sender.track?.id === displayTrack.id,
    );
    expect(screenSender).toBeDefined();
    expect(localStream.getAudioTracks()).toEqual([microphone]);
    expect(localStream.getVideoTracks()).toEqual([displayTrack]);
    expect(microphone.enabled).toBe(true);

    await stopScreenShare({ localStream });
    expect(screenSender?.track).toBeNull();
    expect(localStream.getAudioTracks()).toEqual([microphone]);
    expect(localStream.getVideoTracks()).toEqual([]);

    const camera = makeTrack("video", "camera");
    (localStream as unknown as MediaStream).addTrack(
      camera as unknown as MediaStreamTrack,
    );
    await addLocalTracks({
      stream: localStream,
      peerConnection: peer as unknown as RTCPeerConnection,
    });

    expect(peer.senders).toHaveLength(3);
    expect(screenSender?.replaceTrack).toHaveBeenLastCalledWith(null);
    expect(screenSender?.track).toBeNull();
    expect(peer.senders[2].track).toBe(camera);
    expect(audioSender.track).toBe(microphone);
  });
});

describe("web negotiation glare handling", () => {
  beforeEach(() => {
    closeAllPeerConnections();
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: MockPeerConnection,
    });
  });

  it("lets the polite peer roll back its offer and answer the colliding offer", async () => {
    const peer = createPeerConnection({
      participantId: 8,
      callId: "call",
      polite: true,
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    peer.signalingState = "have-local-offer";

    const answer = await createAnswer({
      participantId: 8,
      offer: { type: "offer", sdp: "remote-offer" },
    });

    expect(peer.localDescription).toEqual(
      expect.objectContaining({ type: "answer" }),
    );
    expect(peer.remoteDescription).toEqual(
      expect.objectContaining({ type: "offer", sdp: "remote-offer" }),
    );
    expect(answer?.type).toBe("answer");
  });

  it("applies the answer to a callee-initiated renegotiation", async () => {
    const peer = createPeerConnection({
      participantId: 10,
      callId: "call",
      polite: true,
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    peer.signalingState = "have-local-offer";

    await handleAnswer({
      participantId: 10,
      answer: { type: "answer", sdp: "remote-answer" },
    });

    expect(peer.remoteDescription).toEqual(
      expect.objectContaining({ type: "answer", sdp: "remote-answer" }),
    );
    expect(peer.signalingState).toBe("stable");
  });

  it("lets the impolite peer ignore the colliding offer", async () => {
    const peer = createPeerConnection({
      participantId: 9,
      callId: "call",
      polite: false,
      onRemoteStream: jest.fn(),
      onConnectionStateChange: jest.fn(),
    }) as unknown as MockPeerConnection;
    peer.signalingState = "have-local-offer";

    const answer = await createAnswer({
      participantId: 9,
      offer: { type: "offer", sdp: "remote-offer" },
    });

    expect(answer).toBeNull();
    expect(peer.remoteDescription).toBeNull();
    expect(peer.signalingState).toBe("have-local-offer");
  });
});

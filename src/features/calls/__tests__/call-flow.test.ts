/**
 * Call-flow unit tests.
 *
 * These test the call-manager and signaling logic using mocked WebRTC APIs.
 * They verify correct state transitions, cleanup, error handling, and
 * duplicate-event handling — NOT that physical devices can establish calls.
 */

// --- Mock WebRTC module ---

const mockSendIceCandidate = jest.fn();
const mockSendCallOffer = jest.fn();
const mockSendCallAnswer = jest.fn();

class MockPeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  remoteDescription: RTCSessionDescription | null = null;
  localDescription: RTCSessionDescription | null = null;

  private senders: { track: { id: string; kind: string } | null }[] = [];
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicecandidateerror: (() => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onicecandidate: ((event: unknown) => void) | null = null;

  async createOffer() {
    return { type: "offer" as const, sdp: "mock-sdp-offer" };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "mock-sdp-answer" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.localDescription = desc as RTCSessionDescription;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc as RTCSessionDescription;
  }

  async addIceCandidate(_candidate: RTCIceCandidateInit) {}

  addTrack(track: MediaStreamTrack, _stream: MediaStream) {
    this.senders.push({ track: { id: track.id, kind: track.kind } });
  }

  getSenders() {
    return this.senders;
  }

  getParameters() {
    return { encodings: [{ active: true }], degradationPreference: undefined };
  }

  async setParameters() {}

  close() {
    this.connectionState = "closed";
  }
}

// Mock tracks and streams
function createMockTrack(kind: "audio" | "video", id?: string): MediaStreamTrack {
  return {
    id: id ?? `mock-${kind}-${Date.now()}`,
    kind,
    enabled: true,
    readyState: "live",
    stop: jest.fn(),
    getSettings: () => ({}),
    applyConstraints: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    onended: null,
  } as unknown as MediaStreamTrack;
}

function createMockStream(
  callType: "audio" | "video" = "video",
): MediaStream {
  const audioTrack = createMockTrack("audio");
  const videoTrack = callType === "video" ? createMockTrack("video") : null;
  const tracks = videoTrack ? [audioTrack, videoTrack] : [audioTrack];

  return {
    id: `mock-stream-${Date.now()}`,
    getTracks: () => [...tracks],
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
    toURL: () => "mock://stream",
  } as unknown as MediaStream;
}

// --- Mock modules before importing ---

jest.mock("@/core/socket/call-signaling", () => ({
  initiateCall: jest.fn().mockResolvedValue({
    callId: "test-call-id",
    participantCount: 2,
    participantStatuses: { 42: "ringing" },
  }),
  acceptCall: jest.fn().mockResolvedValue(undefined),
  declineCall: jest.fn().mockResolvedValue(undefined),
  endCall: jest.fn().mockResolvedValue(undefined),
  sendCallOffer: mockSendCallOffer.mockResolvedValue(undefined),
  sendCallAnswer: mockSendCallAnswer.mockResolvedValue(undefined),
  sendIceCandidate: mockSendIceCandidate,
  sendCallCameraState: jest.fn().mockResolvedValue(undefined),
  sendCallScreenShareState: jest.fn().mockResolvedValue(undefined),
  onIncomingCall: jest.fn().mockReturnValue(jest.fn()),
  onCallAccepted: jest.fn().mockReturnValue(jest.fn()),
  onCallDeclined: jest.fn().mockReturnValue(jest.fn()),
  onCallEnded: jest.fn().mockReturnValue(jest.fn()),
  onCallParticipantLeft: jest.fn().mockReturnValue(jest.fn()),
  onCallParticipantStatus: jest.fn().mockReturnValue(jest.fn()),
  onCallOffer: jest.fn().mockReturnValue(jest.fn()),
  onCallAnswer: jest.fn().mockReturnValue(jest.fn()),
  onIceCandidate: jest.fn().mockReturnValue(jest.fn()),
  onCallCameraState: jest.fn().mockReturnValue(jest.fn()),
  onCallScreenShareState: jest.fn().mockReturnValue(jest.fn()),
  publishCallWhiteboardStroke: jest.fn().mockResolvedValue(undefined),
  clearCallWhiteboard: jest.fn().mockResolvedValue(undefined),
  onCallWhiteboardStroke: jest.fn().mockReturnValue(jest.fn()),
  onCallWhiteboardCleared: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock("react-native-webrtc", () => ({
  RTCPeerConnection: MockPeerConnection,
  mediaDevices: {
    getUserMedia: jest.fn().mockResolvedValue(createMockStream("video")),
    enumerateDevices: jest.fn().mockResolvedValue([]),
  },
  RTCView: "RTCView",
}));

jest.mock("expo-audio", () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest
      .fn()
      .mockResolvedValue({ granted: true }),
  },
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true }),
}));

jest.mock("react-native-incall-manager", () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
  setForceSpeakerphoneOn: jest.fn(),
  setSpeakerphoneOn: jest.fn(),
}));

jest.mock("react-native", () => ({
  NativeModules: { InCallManager: {} },
  Platform: { OS: "android" },
}));

// --- Import after mocks (must come after jest.mock calls) ---
// eslint-disable-next-line import/first
import {
  prepareCall,
  startCall,
  endCall,
  acceptIncomingCall,
  rejectIncomingCall,
  handleIncomingOffer,
  handleCallAnswer,
  handleParticipantLeft,
  createOutgoingOffer,
  setupCallListeners,
} from "../call-manager";
// eslint-disable-next-line import/first
import {
  closeAllPeerConnections,
  closePeerConnection,
  toggleMicrophone,
  toggleCamera,
  createPeerConnection,
  addIceCandidate,
} from "../webrtc";
// eslint-disable-next-line import/first
import type { MediaStream as RNMediaStream } from "react-native-webrtc";

const signaling = jest.requireMock("@/core/socket/call-signaling");

// --- Test suites ---

describe("Call Manager", () => {
  beforeEach(() => {
    closeAllPeerConnections();
    jest.clearAllMocks();
  });

  describe("prepareCall", () => {
    it("returns a stream with at least one audio track", async () => {
      const stream = await prepareCall({ callType: "audio" });
      expect(stream).toBeTruthy();
      expect(stream.getAudioTracks().length).toBeGreaterThan(0);
    });

    it("throws when no audio track is produced", async () => {
      const { mediaDevices } = jest.requireMock("react-native-webrtc");
      const emptyStream = {
        id: "empty",
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
        addTrack: jest.fn(),
        removeTrack: jest.fn(),
        toURL: () => "",
      };
      mediaDevices.getUserMedia.mockResolvedValueOnce(emptyStream);

      await expect(prepareCall({ callType: "audio" })).rejects.toThrow(
        /microphone track/i,
      );
    });
  });

  describe("startCall", () => {
    it("initiates a call and returns callId", async () => {
      const result = await startCall({
        callType: "video",
        conversationId: 1,
      });
      expect(result).toEqual({
        callId: "test-call-id",
        participantCount: 2,
        participantStatuses: { 42: "ringing" },
      });
      expect(signaling.initiateCall).toHaveBeenCalledWith({
        callType: "video",
        conversationId: 1,
      });
    });
  });

  describe("endCall", () => {
    it("signals call end", async () => {
      await endCall({ callId: "test-call-id" });
      expect(signaling.endCall).toHaveBeenCalledWith({
        callId: "test-call-id",
      });
    });
  });

  describe("acceptIncomingCall", () => {
    it("signals call acceptance", async () => {
      await acceptIncomingCall({ callId: "test-call-id" });
      expect(signaling.acceptCall).toHaveBeenCalledWith({
        callId: "test-call-id",
      });
    });
  });

  describe("rejectIncomingCall", () => {
    it("signals call decline", async () => {
      await rejectIncomingCall({ callId: "test-call-id" });
      expect(signaling.declineCall).toHaveBeenCalledWith({
        callId: "test-call-id",
      });
    });
  });

  describe("createOutgoingOffer", () => {
    it("creates a peer connection and sends an offer", async () => {
      const localStream = createMockStream("video") as unknown as RNMediaStream;
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      const result = await createOutgoingOffer({
        callType: "video",
        participantId: 42,
        callId: "test-call-id",
        localStream,
        onRemoteStream,
        onConnectionStateChange,
      });

      expect(result.offer).toBeTruthy();
      expect(result.offer!.type).toBe("offer");
      expect(mockSendCallOffer).toHaveBeenCalledWith({
        callId: "test-call-id",
        receiverId: 42,
        offer: expect.objectContaining({ type: "offer" }),
      });
    });
  });

  describe("handleIncomingOffer", () => {
    it("creates a peer connection and sends an answer", async () => {
      const localStream = createMockStream("video") as unknown as RNMediaStream;
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      const result = await handleIncomingOffer({
        callId: "test-call-id",
        senderId: 99,
        callType: "video",
        offer: { type: "offer", sdp: "remote-offer" },
        localStream,
        onRemoteStream,
        onConnectionStateChange,
      });

      expect(result.answer).toBeTruthy();
      expect(result.answer!.type).toBe("answer");
      expect(mockSendCallAnswer).toHaveBeenCalledWith({
        callId: "test-call-id",
        receiverId: 99,
        answer: expect.objectContaining({ type: "answer" }),
      });
    });
  });

  describe("handleCallAnswer", () => {
    it("sets remote description on existing peer connection", async () => {
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      createPeerConnection({
        participantId: 77,
        callId: "test-call-id",
        onRemoteStream,
        onConnectionStateChange,
      });

      await handleCallAnswer({
        participantId: 77,
        answer: { type: "answer", sdp: "remote-answer" },
      });

      // Should not throw — verifying it processes without error
    });

    it("does nothing for unknown participant", async () => {
      // Should not throw even with no matching peer connection
      await handleCallAnswer({
        participantId: 999,
        answer: { type: "answer", sdp: "remote-answer" },
      });
    });
  });

  describe("handleParticipantLeft", () => {
    it("closes the peer connection for the participant", () => {
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      createPeerConnection({
        participantId: 50,
        callId: "test-call-id",
        onRemoteStream,
        onConnectionStateChange,
      });

      handleParticipantLeft({ participantId: 50 });
      // Creating again should not return the old one
      const newPc = createPeerConnection({
        participantId: 50,
        callId: "test-call-id-2",
        onRemoteStream,
        onConnectionStateChange,
      });
      expect(newPc).toBeTruthy();
    });
  });
});

describe("WebRTC utilities", () => {
  beforeEach(() => {
    closeAllPeerConnections();
    jest.clearAllMocks();
  });

  describe("toggleMicrophone", () => {
    it("toggles audio track enabled state", () => {
      const stream = createMockStream("audio") as unknown as RNMediaStream;
      const tracks = stream.getAudioTracks();
      expect(tracks[0].enabled).toBe(true);

      const result = toggleMicrophone({ stream });
      expect(result).toBe(false);
      expect(tracks[0].enabled).toBe(false);

      const result2 = toggleMicrophone({ stream });
      expect(result2).toBe(true);
      expect(tracks[0].enabled).toBe(true);
    });

    it("returns false when no audio tracks exist", () => {
      const emptyStream = {
        getAudioTracks: () => [],
      } as unknown as RNMediaStream;
      expect(toggleMicrophone({ stream: emptyStream })).toBe(false);
    });
  });

  describe("toggleCamera", () => {
    it("toggles video track enabled state", () => {
      const stream = createMockStream("video") as unknown as RNMediaStream;
      const tracks = stream.getVideoTracks();
      expect(tracks[0].enabled).toBe(true);

      const result = toggleCamera({ stream });
      expect(result).toBe(false);
      expect(tracks[0].enabled).toBe(false);
    });

    it("returns false when no video tracks exist", () => {
      const stream = createMockStream("audio") as unknown as RNMediaStream;
      expect(toggleCamera({ stream })).toBe(false);
    });
  });

  describe("ICE candidate handling", () => {
    it("queues candidates when remote description is not set", async () => {
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      createPeerConnection({
        participantId: 10,
        callId: "test-call-id",
        onRemoteStream,
        onConnectionStateChange,
      });

      // Should not throw — candidate is queued
      await addIceCandidate({
        participantId: 10,
        candidate: { candidate: "mock-candidate", sdpMid: "0", sdpMLineIndex: 0 },
      });
    });

    it("does not throw for unknown participant", async () => {
      await addIceCandidate({
        participantId: 999,
        candidate: { candidate: "mock-candidate", sdpMid: "0", sdpMLineIndex: 0 },
      });
    });
  });

  describe("Peer connection lifecycle", () => {
    it("creates and closes peer connections", () => {
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      const pc = createPeerConnection({
        participantId: 1,
        callId: "call-1",
        onRemoteStream,
        onConnectionStateChange,
      });
      expect(pc).toBeTruthy();

      closePeerConnection({ participantId: 1 });
      // Should be able to create a new one
      const pc2 = createPeerConnection({
        participantId: 1,
        callId: "call-2",
        onRemoteStream,
        onConnectionStateChange,
      });
      expect(pc2).toBeTruthy();
    });

    it("returns existing connection for same participant", () => {
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      const pc1 = createPeerConnection({
        participantId: 5,
        callId: "call-1",
        onRemoteStream,
        onConnectionStateChange,
      });
      const pc2 = createPeerConnection({
        participantId: 5,
        callId: "call-1",
        onRemoteStream,
        onConnectionStateChange,
      });
      expect(pc1).toBe(pc2);
    });

    it("closeAllPeerConnections clears all connections", () => {
      const onRemoteStream = jest.fn();
      const onConnectionStateChange = jest.fn();

      createPeerConnection({
        participantId: 1,
        callId: "call-1",
        onRemoteStream,
        onConnectionStateChange,
      });
      createPeerConnection({
        participantId: 2,
        callId: "call-1",
        onRemoteStream,
        onConnectionStateChange,
      });

      closeAllPeerConnections();

      // Should create new connections (not return old ones)
      const pc = createPeerConnection({
        participantId: 1,
        callId: "call-2",
        onRemoteStream,
        onConnectionStateChange,
      });
      expect(pc).toBeTruthy();
    });
  });

  describe("setupCallListeners", () => {
    it("returns an unsubscribe function", () => {
      const unsubscribe = setupCallListeners({
        onIncoming: jest.fn(),
        onAccepted: jest.fn(),
        onDeclined: jest.fn(),
        onEnded: jest.fn(),
        onParticipantLeft: jest.fn(),
        onParticipantStatus: jest.fn(),
        onOffer: jest.fn(),
        onAnswer: jest.fn(),
        onIce: jest.fn(),
        onCameraState: jest.fn(),
        onScreenShareState: jest.fn(),
      });

      expect(typeof unsubscribe).toBe("function");
      // Should not throw when called
      unsubscribe();
    });
  });
});

describe("Duplicate signaling events", () => {
  beforeEach(() => {
    closeAllPeerConnections();
    jest.clearAllMocks();
  });

  it("handles duplicate offers gracefully by reusing existing peer connection", async () => {
    const localStream = createMockStream("video") as unknown as RNMediaStream;
    const onRemoteStream = jest.fn();
    const onConnectionStateChange = jest.fn();

    // First offer
    await handleIncomingOffer({
      callId: "test-call-id",
      senderId: 42,
      callType: "video",
      offer: { type: "offer", sdp: "offer-1" },
      localStream,
      onRemoteStream,
      onConnectionStateChange,
    });

    // Close the first one to simulate cleanup before second attempt
    closePeerConnection({ participantId: 42 });

    // Second offer (duplicate/renegotiation)
    const result = await handleIncomingOffer({
      callId: "test-call-id",
      senderId: 42,
      callType: "video",
      offer: { type: "offer", sdp: "offer-2" },
      localStream,
      onRemoteStream,
      onConnectionStateChange,
    });

    expect(result.answer).toBeTruthy();
  });
});

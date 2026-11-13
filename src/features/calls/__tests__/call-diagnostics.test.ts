import { startCallStatsLogger } from "../call-diagnostics";

describe("development call stats logger", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("logs a compact selected-route and video stats line every three seconds", async () => {
    jest.useFakeTimers();
    Object.defineProperty(globalThis, "__DEV__", {
      configurable: true,
      value: true,
    });
    const reports = [
      {
        id: "transport",
        type: "transport",
        selectedCandidatePairId: "pair",
      },
      {
        id: "pair",
        type: "candidate-pair",
        state: "succeeded",
        localCandidateId: "local",
        remoteCandidateId: "remote",
        currentRoundTripTime: 0.023,
        availableOutgoingBitrate: 1_500_000,
      },
      {
        id: "local",
        type: "local-candidate",
        candidateType: "host",
        protocol: "udp",
      },
      {
        id: "remote",
        type: "remote-candidate",
        candidateType: "srflx",
        protocol: "udp",
      },
      {
        id: "outbound",
        type: "outbound-rtp",
        kind: "video",
        frameWidth: 1280,
        frameHeight: 720,
        framesPerSecond: 30,
        qualityLimitationReason: "none",
        bytesSent: 1234,
      },
      {
        id: "inbound",
        type: "inbound-rtp",
        kind: "video",
        frameWidth: 1280,
        frameHeight: 720,
        framesPerSecond: 30,
        packetsLost: 2,
        framesDropped: 1,
      },
    ];
    const pc = {
      connectionState: "connected",
      iceConnectionState: "connected",
      getStats: jest.fn().mockResolvedValue(
        new Map(reports.map((report) => [report.id, report])),
      ),
    };
    const log = jest.spyOn(console, "info").mockImplementation(() => {});
    const stop = startCallStatsLogger(
      42,
      pc as unknown as RTCPeerConnection,
    );

    await jest.advanceTimersByTimeAsync(3000);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain(
      "pair=host/srflx rtt=23ms outgoing=1500kbps",
    );
    expect(log.mock.calls[0][0]).toContain(
      "videoOut=1280x720@30fps limit=none bytesSent=1234",
    );
    expect(log.mock.calls[0][0]).toContain(
      "videoIn=1280x720@30fps packetsLost=2 framesDropped=1",
    );
    stop();
  });
});

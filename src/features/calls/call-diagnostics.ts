/**
 * WebRTC diagnostics for video quality investigation.
 *
 * Collects available performance metrics from active peer connections.
 * Call `collectDiagnostics()` from developer tooling to gather measurements.
 * These metrics are intentionally not exposed in the normal call UI.
 */

import type { RTCPeerConnection as NativePeerConnection } from "react-native-webrtc";

type PeerConnection = RTCPeerConnection | NativePeerConnection;

// Re-exported by webrtc.native / webrtc.web — but this module accesses
// the connections map directly via the platform-specific getter below.

type CallDiagnostics = {
  timestamp: number;
  peers: PeerDiagnostics[];
};

type PeerDiagnostics = {
  participantId: number;
  connectionState: string;
  iceConnectionState: string;
  selectedCandidatePair: CandidatePairInfo | null;
  outboundVideo: OutboundVideoInfo | null;
  inboundVideo: InboundVideoInfo | null;
  outboundAudio: OutboundAudioInfo | null;
  inboundAudio: InboundAudioInfo | null;
};

type CandidatePairInfo = {
  localType: string;
  remoteType: string;
  localProtocol: string;
  remoteProtocol: string;
  roundTripTime?: number;
  availableOutgoingBitrate?: number;
  bytesReceived?: number;
  bytesSent?: number;
  isRelay: boolean;
};

type OutboundVideoInfo = {
  width?: number;
  height?: number;
  framesPerSecond?: number;
  framesSent?: number;
  framesEncoded?: number;
  bytesSent?: number;
  packetsSent?: number;
  qualityLimitationReason?: string;
  qualityLimitationDurations?: Record<string, number>;
  encoderImplementation?: string;
  codec?: string;
  bitrate?: number;
};

type InboundVideoInfo = {
  width?: number;
  height?: number;
  framesPerSecond?: number;
  framesReceived?: number;
  framesDecoded?: number;
  framesDropped?: number;
  bytesReceived?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
  codec?: string;
};

type OutboundAudioInfo = {
  bytesSent?: number;
  packetsSent?: number;
  codec?: string;
};

type InboundAudioInfo = {
  bytesReceived?: number;
  packetsReceived?: number;
  packetsLost?: number;
  jitter?: number;
  codec?: string;
};

/** Extract diagnostics from a set of active peer connections. */
export async function collectDiagnostics(
  connections: Map<number, PeerConnection>,
): Promise<CallDiagnostics> {
  const peers: PeerDiagnostics[] = [];

  for (const [participantId, pc] of connections) {
    try {
      const diag = await collectPeerDiagnostics(participantId, pc);
      peers.push(diag);
    } catch (err) {
      console.warn(
        `Could not collect diagnostics for participant ${participantId}:`,
        err,
      );
      peers.push({
        participantId,
        connectionState: pc.connectionState ?? "unknown",
        iceConnectionState: pc.iceConnectionState ?? "unknown",
        selectedCandidatePair: null,
        outboundVideo: null,
        inboundVideo: null,
        outboundAudio: null,
        inboundAudio: null,
      });
    }
  }

  return { timestamp: Date.now(), peers };
}

async function collectPeerDiagnostics(
  participantId: number,
  pc: PeerConnection,
): Promise<PeerDiagnostics> {
  const stats = await pc.getStats();

  let selectedCandidatePair: CandidatePairInfo | null = null;
  let outboundVideo: OutboundVideoInfo | null = null;
  let inboundVideo: InboundVideoInfo | null = null;
  let outboundAudio: OutboundAudioInfo | null = null;
  let inboundAudio: InboundAudioInfo | null = null;

  // Collect codec names for lookup
  const codecs = new Map<string, string>();

  const entries: { type: string; [key: string]: unknown }[] = [];
  // stats may be a Map or array-like depending on platform
  if (typeof (stats as Map<string, unknown>).forEach === "function") {
    (stats as Map<string, { type: string; [key: string]: unknown }>).forEach(
      (report) => entries.push(report),
    );
  }

  // First pass: collect codecs
  for (const report of entries) {
    if (report.type === "codec" && typeof report.mimeType === "string") {
      codecs.set(String(report.id), report.mimeType);
    }
  }

  // Second pass: collect stats
  const selectedPairIds = new Set(
    entries
      .filter(
        (report) =>
          report.type === "transport" &&
          typeof report.selectedCandidatePairId === "string",
      )
      .map((report) => String(report.selectedCandidatePairId)),
  );

  for (const report of entries) {
    if (
      report.type === "candidate-pair" &&
      (selectedPairIds.has(String(report.id)) ||
        (selectedPairIds.size === 0 &&
          (report.state === "succeeded" || report.nominated === true)))
    ) {
      const localCandidate = entries.find(
        (r) =>
          r.type === "local-candidate" &&
          String(r.id) === String(report.localCandidateId),
      );
      const remoteCandidate = entries.find(
        (r) =>
          r.type === "remote-candidate" &&
          String(r.id) === String(report.remoteCandidateId),
      );

      const localType = String(localCandidate?.candidateType ?? "unknown");
      const remoteType = String(remoteCandidate?.candidateType ?? "unknown");

      selectedCandidatePair = {
        localType,
        remoteType,
        localProtocol: String(localCandidate?.protocol ?? "unknown"),
        remoteProtocol: String(remoteCandidate?.protocol ?? "unknown"),
        roundTripTime: toNumber(report.currentRoundTripTime),
        availableOutgoingBitrate: toNumber(report.availableOutgoingBitrate),
        bytesReceived: toNumber(report.bytesReceived),
        bytesSent: toNumber(report.bytesSent),
        isRelay: localType === "relay" || remoteType === "relay",
      };
    }

    const mediaKind = report.kind ?? report.mediaType;

    if (report.type === "outbound-rtp" && mediaKind === "video") {
      outboundVideo = {
        width: toNumber(report.frameWidth),
        height: toNumber(report.frameHeight),
        framesPerSecond: toNumber(report.framesPerSecond),
        framesSent: toNumber(report.framesSent),
        framesEncoded: toNumber(report.framesEncoded),
        bytesSent: toNumber(report.bytesSent),
        packetsSent: toNumber(report.packetsSent),
        qualityLimitationReason: report.qualityLimitationReason as
          | string
          | undefined,
        qualityLimitationDurations: report.qualityLimitationDurations as
          | Record<string, number>
          | undefined,
        encoderImplementation: report.encoderImplementation as
          | string
          | undefined,
        codec: codecs.get(String(report.codecId)) ?? undefined,
      };
    }

    if (report.type === "inbound-rtp" && mediaKind === "video") {
      inboundVideo = {
        width: toNumber(report.frameWidth),
        height: toNumber(report.frameHeight),
        framesPerSecond: toNumber(report.framesPerSecond),
        framesReceived: toNumber(report.framesReceived),
        framesDecoded: toNumber(report.framesDecoded),
        framesDropped: toNumber(report.framesDropped),
        bytesReceived: toNumber(report.bytesReceived),
        packetsReceived: toNumber(report.packetsReceived),
        packetsLost: toNumber(report.packetsLost),
        jitter: toNumber(report.jitter),
        codec: codecs.get(String(report.codecId)) ?? undefined,
      };
    }

    if (report.type === "outbound-rtp" && mediaKind === "audio") {
      outboundAudio = {
        bytesSent: toNumber(report.bytesSent),
        packetsSent: toNumber(report.packetsSent),
        codec: codecs.get(String(report.codecId)) ?? undefined,
      };
    }

    if (report.type === "inbound-rtp" && mediaKind === "audio") {
      inboundAudio = {
        bytesReceived: toNumber(report.bytesReceived),
        packetsReceived: toNumber(report.packetsReceived),
        packetsLost: toNumber(report.packetsLost),
        jitter: toNumber(report.jitter),
        codec: codecs.get(String(report.codecId)) ?? undefined,
      };
    }
  }

  return {
    participantId,
    connectionState: pc.connectionState ?? "unknown",
    iceConnectionState: pc.iceConnectionState ?? "unknown",
    selectedCandidatePair,
    outboundVideo,
    inboundVideo,
    outboundAudio,
    inboundAudio,
  };
}

function compactValue(value: number | undefined, digits = 0) {
  return value === undefined ? "?" : value.toFixed(digits);
}

function compactVideo(video: OutboundVideoInfo | InboundVideoInfo | null) {
  if (!video) return "none";
  return `${video.width ?? "?"}x${video.height ?? "?"}@${compactValue(video.framesPerSecond)}fps`;
}

function compactBytes(value: number | undefined) {
  return value === undefined ? "?" : String(value);
}

function formatCompactCallStats(peer: PeerDiagnostics) {
  const pair = peer.selectedCandidatePair;
  const outbound = peer.outboundVideo;
  const inbound = peer.inboundVideo;
  return [
    "[call][stats]",
    `peer=${peer.participantId}`,
    `pair=${pair ? `${pair.localType}/${pair.remoteType}` : "?"}`,
    `rtt=${pair?.roundTripTime === undefined ? "?" : compactValue(pair.roundTripTime * 1000)}ms`,
    `outgoing=${pair?.availableOutgoingBitrate === undefined ? "?" : compactValue(pair.availableOutgoingBitrate / 1000)}kbps`,
    `videoOut=${compactVideo(outbound)}`,
    `limit=${outbound?.qualityLimitationReason ?? "?"}`,
    `bytesSent=${compactBytes(outbound?.bytesSent)}`,
    `videoIn=${compactVideo(inbound)}`,
    `packetsLost=${compactBytes(inbound?.packetsLost)}`,
    `framesDropped=${compactBytes(inbound?.framesDropped)}`,
  ].join(" ");
}

/** Logs one compact, credential-free stats line every three seconds in development. */
export function startCallStatsLogger(
  participantId: number,
  pc: PeerConnection,
): () => void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return () => {};

  let stopped = false;
  let collecting = false;
  const interval = setInterval(() => {
    if (stopped || collecting || pc.connectionState === "closed") return;

    collecting = true;
    void collectPeerDiagnostics(participantId, pc)
      .then((peer) => {
        if (!stopped) console.info(formatCompactCallStats(peer));
      })
      .catch((error: unknown) => {
        if (stopped) return;
        const detail =
          error instanceof Error ? error.message : "stats unavailable";
        console.warn(`[call][stats] peer=${participantId} error=${detail}`);
      })
      .finally(() => {
        collecting = false;
      });
  }, 3000);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}

/** Format diagnostics for display or logging. */
export function formatDiagnostics(diag: CallDiagnostics): string {
  const lines: string[] = [
    `=== Call Diagnostics (${new Date(diag.timestamp).toLocaleTimeString()}) ===`,
  ];

  for (const peer of diag.peers) {
    lines.push("");
    lines.push(`--- Peer ${peer.participantId} ---`);
    lines.push(
      `Connection: ${peer.connectionState} | ICE: ${peer.iceConnectionState}`,
    );

    const cp = peer.selectedCandidatePair;
    if (cp) {
      lines.push(
        `Route: ${cp.localType}/${cp.localProtocol} ↔ ${cp.remoteType}/${cp.remoteProtocol}${cp.isRelay ? " [RELAY]" : " [DIRECT]"}`,
      );
      if (cp.roundTripTime !== undefined) {
        lines.push(`RTT: ${(cp.roundTripTime * 1000).toFixed(0)}ms`);
      }
      if (cp.availableOutgoingBitrate !== undefined) {
        lines.push(
          `Available outgoing bitrate: ${(cp.availableOutgoingBitrate / 1000).toFixed(0)} kbps`,
        );
      }
    } else {
      lines.push("Route: not available");
    }

    const ov = peer.outboundVideo;
    if (ov) {
      lines.push(
        `Video out: ${ov.width ?? "?"}×${ov.height ?? "?"} @ ${ov.framesPerSecond ?? "?"}fps | framesSent: ${ov.framesSent ?? "?"} | bytesSent: ${ov.bytesSent ?? "?"}`,
      );
      if (ov.qualityLimitationReason) {
        lines.push(`Quality limitation: ${ov.qualityLimitationReason}`);
      }
      if (ov.encoderImplementation) {
        lines.push(`Encoder: ${ov.encoderImplementation}`);
      }
      if (ov.codec) {
        lines.push(`Video codec: ${ov.codec}`);
      }
    }

    const iv = peer.inboundVideo;
    if (iv) {
      lines.push(
        `Video in: ${iv.width ?? "?"}×${iv.height ?? "?"} @ ${iv.framesPerSecond ?? "?"}fps`,
      );
      if (iv.packetsLost !== undefined && iv.packetsReceived !== undefined) {
        const lossRate =
          iv.packetsReceived > 0
            ? ((iv.packetsLost / (iv.packetsReceived + iv.packetsLost)) * 100).toFixed(1)
            : "0.0";
        lines.push(`Packet loss: ${lossRate}%`);
      }
      if (iv.framesDropped !== undefined) {
        lines.push(`Frames dropped: ${iv.framesDropped}`);
      }
      if (iv.jitter !== undefined) {
        lines.push(`Jitter: ${(iv.jitter * 1000).toFixed(1)}ms`);
      }
    }

    const oa = peer.outboundAudio;
    if (oa?.codec) {
      lines.push(`Audio codec: ${oa.codec}`);
    }

    const ia = peer.inboundAudio;
    if (ia) {
      if (ia.packetsLost !== undefined && ia.packetsReceived !== undefined) {
        const lossRate =
          ia.packetsReceived > 0
            ? ((ia.packetsLost / (ia.packetsReceived + ia.packetsLost)) * 100).toFixed(1)
            : "0.0";
        lines.push(`Audio packet loss: ${lossRate}%`);
      }
      if (ia.jitter !== undefined) {
        lines.push(`Audio jitter: ${(ia.jitter * 1000).toFixed(1)}ms`);
      }
    }
  }

  return lines.join("\n");
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

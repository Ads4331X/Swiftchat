type IceCandidateErrorLike = {
  url?: string | null;
  errorCode?: number | null;
  errorText?: string | null;
  address?: string | null;
  port?: number | null;
  hostCandidate?: string | null;
};

type TrackLike =
  | {
      id?: string;
      kind?: string;
      enabled?: boolean;
      muted?: boolean;
      readyState?: string;
    }
  | null
  | undefined;

type StreamLike = {
  id?: string;
  getAudioTracks: () => unknown[];
  getVideoTracks: () => unknown[];
};

type PeerState = {
  participantId: number;
  callId: string;
  connectionState?: string;
  iceConnectionState?: string;
  signalingState?: string;
  iceGatheringState?: string;
};

const lastPeerStates = new Map<string, string>();

export function sanitizeIceUrl(url?: string | null) {
  if (!url) return undefined;

  return url
    .replace(/^((?:stuns?|turns?):)(?:\/\/)?(?:[^@/]*@)?/i, "$1")
    .split(/[?#]/, 1)[0];
}

export function describeSdp(sdp?: string) {
  if (!sdp) return { media: [] as string[], audio: false, video: false };

  const media = [...sdp.matchAll(/^m=([a-z0-9]+)/gim)].map((match) =>
    match[1].toLowerCase(),
  );

  return {
    media,
    audio: media.includes("audio"),
    video: media.includes("video"),
  };
}

export function describeTrack(track?: TrackLike) {
  if (!track) return null;

  return {
    id: track.id,
    kind: track.kind,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
  };
}

export function logIceCandidateError({
  participantId,
  callId,
  event,
}: {
  participantId: number;
  callId: string;
  event: IceCandidateErrorLike;
}) {
  console.warn("[call][ice] candidate error (may be non-fatal)", {
    participantId,
    callId,
    url: sanitizeIceUrl(event.url),
    errorCode: event.errorCode,
    errorText: event.errorText,
    address: event.address,
    port: event.port,
    hostCandidate: event.hostCandidate,
  });
}

export function logPeerState(state: PeerState) {
  const key = `${state.callId}:${state.participantId}`;
  const signature = [
    state.connectionState,
    state.iceConnectionState,
    state.signalingState,
    state.iceGatheringState,
  ].join("|");

  if (lastPeerStates.get(key) === signature) return;
  lastPeerStates.set(key, signature);

  console.info("[call][peer] state", { ...state });
}

export function logRemoteTrack({
  participantId,
  callId,
  streams,
  track,
}: {
  participantId: number;
  callId: string;
  streams: readonly StreamLike[];
  track?: TrackLike;
}) {
  console.info("[call][peer] remote track received", {
    participantId,
    callId,
    track: describeTrack(track),
    streams: streams.map((stream) => ({
      id: stream.id,
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
    })),
  });
}

type SignalingStateSource = {
  signalingState: RTCSignalingState;
};

const peerOperationQueues = new Map<number, Promise<unknown>>();

export function runPeerOperation<T>(
  participantId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = peerOperationQueues.get(participantId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);

  peerOperationQueues.set(participantId, next);
  void next
    .finally(() => {
      if (peerOperationQueues.get(participantId) === next) {
        peerOperationQueues.delete(participantId);
      }
    })
    .catch(() => undefined);

  return next;
}

export function clearPeerOperationQueue(participantId: number) {
  peerOperationQueues.delete(participantId);
}

export function clearAllPeerOperationQueues() {
  peerOperationQueues.clear();
}

export async function waitForStableSignalingState(
  peerConnection: SignalingStateSource,
  timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (
    peerConnection.signalingState &&
    peerConnection.signalingState !== "stable"
  ) {
    if (
      peerConnection.signalingState === "closed" ||
      Date.now() >= deadline
    ) {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return true;
}

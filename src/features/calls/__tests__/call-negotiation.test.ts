import {
  clearAllPeerOperationQueues,
  clearPeerOperationQueue,
  runPeerOperation,
} from "../call-negotiation";

describe("per-peer negotiation queue", () => {
  afterEach(() => clearAllPeerOperationQueues());

  it("serializes operations for the same participant", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runPeerOperation(1, async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });
    const second = runPeerOperation(1, async () => {
      order.push("second");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["first-start"]);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("allows different participants to negotiate in parallel", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];

    const first = runPeerOperation(1, async () => {
      await gate;
      order.push("one");
    });
    const second = runPeerOperation(2, async () => {
      order.push("two");
    });

    await second;
    expect(order).toContain("two");
    release();
    await first;
  });

  it("continues after a failed operation", async () => {
    await expect(
      runPeerOperation(3, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");

    await expect(
      runPeerOperation(3, async () => "recovered"),
    ).resolves.toBe("recovered");

    clearPeerOperationQueue(3);
  });
});

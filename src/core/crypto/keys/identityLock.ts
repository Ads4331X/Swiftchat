/*
 * Identity key setup is a read-decide-write sequence: it reads the local keys,
 * queries the server, and then either recovers an existing identity from the
 * PIN backup or generates/registers a brand-new one. Two tabs (or two screens)
 * running that sequence concurrently could otherwise mint *different* keypairs
 * for the same account, leaving the registered public key and the recovery
 * backup pointing at different identities.
 *
 * This lock serializes the whole sequence:
 *  - the Web Locks API when available (browser-managed, coordinates across
 *    tabs, and is auto-released if a tab crashes),
 *  - otherwise a best-effort localStorage lease (still coordinates across
 *    tabs; released on completion or expiry),
 *  - plus an in-process promise queue so same-runtime callers always serialize
 *    (sufficient on native, which has a single JS runtime).
 */

const LOCK_NAME = "swiftchat.identity.lock";
const LEASE_MS = 30_000;
const ACQUIRE_TIMEOUT_MS = 30_000;
const POLL_MS = 50;

// Serializes callers that share a JS runtime (native, and same-tab on web).
let queue: Promise<unknown> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // Keep the chain alive regardless of whether the task resolves or rejects.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LockManagerLike = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
};

function getWebLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function readLease(): { token: string; expiresAt: number } | null {
  try {
    const raw = window.localStorage.getItem(LOCK_NAME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token !== "string") return null;
    return { token: parsed.token, expiresAt: Number(parsed.expiresAt) || 0 };
  } catch {
    return null;
  }
}

async function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;

  for (;;) {
    const lease = readLease();
    if (!lease || lease.expiresAt <= Date.now()) {
      window.localStorage.setItem(
        LOCK_NAME,
        JSON.stringify({ token, expiresAt: Date.now() + LEASE_MS }),
      );
      // Re-read to detect a simultaneous writer. localStorage has no
      // compare-and-swap, so this is best effort.
      if (readLease()?.token === token) break;
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for identity key setup.");
    }
    await sleep(POLL_MS);
  }

  try {
    return await fn();
  } finally {
    if (readLease()?.token === token) {
      window.localStorage.removeItem(LOCK_NAME);
    }
  }
}

async function withWebLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = getWebLocks();
  if (!locks) return fn();
  return locks.request(LOCK_NAME, () => fn());
}

export function withIdentityLock<T>(fn: () => Promise<T>): Promise<T> {
  return runExclusive(() => {
    if (getWebLocks()) return withWebLock(fn);
    if (hasLocalStorage()) return withStorageLock(fn);
    return fn();
  });
}

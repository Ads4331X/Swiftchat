import { useEffect, useSyncExternalStore } from "react";
import { listenForPresence } from "@/core/socket";

type PresenceSnapshot = Record<number, boolean>;

let onlineUsers: PresenceSnapshot = {};
const listeners = new Set<() => void>();

function updatePresence(userId: number, online: boolean) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (onlineUsers[id] === online) return;

  onlineUsers = { ...onlineUsers, [id]: online };
  listeners.forEach((listener) => listener());
}

/**
 * Seeds the shared presence store from a known `lastSeen` value
 * (e.g. an API response). Only `lastSeen === null` (currently online)
 * seeds the store as online; offline states are driven by socket
 * `presence` events so a stale/empty fetch can't clobber live data.
 */
export function reportPresence(
  userId: number,
  lastSeen: string | null | undefined,
) {
  if (lastSeen !== null) return;
  updatePresence(userId, true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return listenForPresence(({ userId, lastSeen }) => {
      updatePresence(userId, lastSeen === null);
    });
  }, []);

  return <>{children}</>;
}

export function usePresence(userId?: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (userId != null ? Boolean(onlineUsers[userId]) : false),
  );
}
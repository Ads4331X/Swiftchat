import { Platform } from "react-native";
import { getSetting, setSetting } from "@/lib/db";

/**
 * Tracks which conversations have already been opened & loaded at least once
 * on this device. Used to show the message skeleton ONLY the very first time
 * a conversation is ever opened — not on every remount/app reload.
 *
 * Web keeps this in localStorage (synchronous), native persists it to the
 * SQLite `settings` table. An in-memory set makes repeated lookups cheap and
 * lets a still-loading native store fall back to "not seen anyway".
 */
const NATIVE_KEY = "seen_conversations";
const WEB_KEY = "swiftchat_seen_conversations";

const seen = new Set<number>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

function readWeb(): Set<number> {
  if (typeof window === "undefined") return new Set<number>();
  try {
    const raw = window.localStorage.getItem(WEB_KEY);
    const arr = raw ? (JSON.parse(raw) as number[]) : [];
    return new Set(arr.map(Number).filter(Number.isFinite));
  } catch {
    return new Set<number>();
  }
}

function writeWeb(values: Set<number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WEB_KEY, JSON.stringify([...values]));
  } catch {}
}

function loadSeenConversations(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        if (Platform.OS === "web") {
          readWeb().forEach((id) => seen.add(id));
        } else {
          const raw = await getSetting(NATIVE_KEY);
          const arr = raw ? (JSON.parse(raw) as number[]) : [];
          arr.map(Number).filter(Number.isFinite).forEach((id) => seen.add(id));
        }
      } catch {
        // no persisted state — fine
      }
      loaded = true;
    })();
  }
  return loadPromise;
}

/** Synchronous check — always instant on web (localStorage), in-memory otherwise. */
export function hasSeenConversation(conversationId: number): boolean {
  if (Platform.OS === "web") return readWeb().has(conversationId);
  return seen.has(conversationId);
}

export async function isConversationSeen(
  conversationId: number,
): Promise<boolean> {
  await loadSeenConversations();
  return seen.has(conversationId);
}

export async function markConversationSeen(conversationId: number) {
  await loadSeenConversations();
  if (seen.has(conversationId)) return;
  seen.add(conversationId);
  try {
    if (Platform.OS === "web") {
      writeWeb(seen);
    } else {
      await setSetting(NATIVE_KEY, JSON.stringify([...seen]));
    }
  } catch {
    // persistence failure — memory still prevents the skeleton this session
  }
}
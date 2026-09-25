import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  addBlockedUser,
  getBlockedUserIds,
  removeBlockedUser,
  syncBlockedUsers,
} from "@/lib/db/blockedUsers";
import { getBlockedUsers as fetchBlockedUsers } from "@/lib/api";

export function useBlockedUsers() {
  const [blockedIds, setBlockedIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  // Re-read the local cache, then reconcile with the server so blocks made on
  // this or another device show up without needing a full app remount.
  const refresh = useCallback(async () => {
    setBlockedIds([...(await getBlockedUserIds())]);
    setReady(true);

    try {
      const serverIds = await fetchBlockedUsers();
      await syncBlockedUsers(serverIds);
      const merged = await getBlockedUserIds();
      // The local cache can be unavailable (e.g. web) — fall back to server.
      setBlockedIds(merged.length > 0 ? merged : serverIds);
    } catch {
      // Offline — keep whatever is cached locally.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const addBlockUserId = async (userId: number) => {
    await addBlockedUser(userId);
    setBlockedIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
  };

  const removeBlockUserId = async (userId: number) => {
    await removeBlockedUser(userId);
    setBlockedIds((prev) => prev.filter((id) => id !== userId));
  };

  return { blockedIds, addBlockUserId, removeBlockUserId, refresh, ready };
}

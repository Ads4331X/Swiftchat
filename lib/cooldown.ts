import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";

async function setCooldown(key: string, durationMs: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      `cooldown:${key}`,
      String(Date.now() + durationMs),
    );
  } catch {}
}

async function getCooldownMs(key: string): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(`cooldown:${key}`);
    if (!raw) return 0;
    const remaining = Number(raw) - Date.now();
    if (remaining > 0) return remaining;
    await SecureStore.deleteItemAsync(`cooldown:${key}`);
    return 0;
  } catch {
    return 0;
  }
}

export function useCooldown(key: string) {
  const [remainingMs, setRemainingMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCooldownMs(key).then((ms) => {
      if (!cancelled) setRemainingMs(ms);
    });
    intervalRef.current = setInterval(() => {
      setRemainingMs((prev) => (prev <= 1000 ? 0 : prev - 1000));
    }, 1000);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [key]);

  const start = (durationMs: number) => {
    setRemainingMs(durationMs);
    setCooldown(key, durationMs);
  };

  return { remainingMs, start };
}

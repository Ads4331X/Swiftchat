import { useCallback, useState } from "react";
import { clearAllLocalData } from "@/lib/db";
import { getBackendUrl } from "@/lib/api";
import { addRecoveryPin, ensureLocalKeys, initializeKeys } from "@/lib/crypto";

/**
 * Ensures encryption keys are set up. New accounts get a keypair generated
 * automatically (no PIN required); a recovery PIN is only asked for when
 * restoring existing keys on a new device/reinstall. The PIN is purely an
 * optional back-up feature and never gates chatting.
 */
export function useKeySetup() {
  const [needsPin, setNeedsPin] = useState(false);
  const [pinMode, setPinMode] = useState<"enter" | "add">("enter");
  const [busy, setBusy] = useState(false);

  const setUpKeys = useCallback(async (): Promise<boolean> => {
    const result = await ensureLocalKeys();
    if (result.ok || result.reason === "lost") {
      setNeedsPin(false);
      return true;
    }
    setPinMode("enter");
    setNeedsPin(true);
    return false;
  }, []);

  const initializeWithPin = useCallback(async (pin: string) => {
    setBusy(true);
    try {
      await initializeKeys(pin);
      // Stale local cache (decrypted previews from a previous install) can
      // block correct decryption — wipe it so the app re-fetches from server.
      await clearAllLocalData();
      setNeedsPin(false);
      return { ok: true };
    } catch (err: any) {
      if (err?.isAxiosError || err?.message?.includes("Network Error")) {
        return {
          ok: false,
          error: "Network Error: Cannot connect to server at " + getBackendUrl(),
        };
      }
      return {
        ok: false,
        error: err?.message || "Incorrect PIN. Please try again.",
      };
    } finally {
      setBusy(false);
    }
  }, []);

  const startAddPin = useCallback(() => {
    setPinMode("add");
    setNeedsPin(true);
  }, []);

  const addPin = useCallback(async (pin: string) => {
    setBusy(true);
    try {
      await addRecoveryPin(pin);
      setNeedsPin(false);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || "Could not save PIN." };
    } finally {
      setBusy(false);
    }
  }, []);

  const skip = useCallback(() => {
    setNeedsPin(false);
  }, []);

  return {
    needsPin,
    pinMode,
    busy,
    setUpKeys,
    initializeWithPin,
    startAddPin,
    addPin,
    skip,
  };
}

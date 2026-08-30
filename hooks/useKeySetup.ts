import { useCallback, useState } from "react";
import { clearAllLocalData } from "@/lib/db";
import { getBackendUrl } from "@/lib/api";
import { addRecoveryPin, ensureLocalKeys, initializeKeys } from "@/lib/crypto";

/**
 * Ensures encryption keys are set up. A brand-new account gets a keypair
 * generated automatically and is then invited (never forced) to set a
 * Recovery PIN. A recovery PIN is only *required* when restoring existing
 * keys on a new device/reinstall. In every case the PIN is purely an optional
 * back-up feature and never gates chatting.
 */
export function useKeySetup() {
  const [needsPin, setNeedsPin] = useState(false);
  const [pinMode, setPinMode] = useState<"enter" | "add">("enter");
  const [busy, setBusy] = useState(false);

  const setUpKeys = useCallback(async (): Promise<boolean> => {
    const result = await ensureLocalKeys();
    if (result.ok) {
      if (result.brandNew) {
        // Brand-new keypair was just generated. Show the (skippable) PIN setup
        // modal so the user can optionally back up THIS key.
        setPinMode("add");
        setNeedsPin(true);
        return false;
      }
      setNeedsPin(false);
      return true;
    }
    if (result.reason === "lost") {
      // Old key is unrecoverable — don't mint a replacement, don't ask for a PIN.
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

  // Single submit entry point used by every screen's PinModal: "add" mode
  // backs up the existing (already-generated) key, "enter" mode restores the
  // key from the server backup. The PIN itself is only passed through to the
  // crypto function and is never stored anywhere.
  const submitPin = useCallback(
    async (pin: string) => {
      if (pinMode === "add") {
        return addPin(pin);
      }
      return initializeWithPin(pin);
    },
    [pinMode, addPin, initializeWithPin],
  );

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
    submitPin,
    skip,
  };
}

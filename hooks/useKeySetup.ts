import { useCallback, useState } from "react";
import { getPrivateKey, getPublicKey } from "@/lib/secureStorage";
import { clearAllLocalData } from "@/lib/db";
import {
  hasKeyBackup,
  initializeKeys,
} from "@/lib/crypto";

/**
 * Ensures encryption keys are set up, collecting the recovery PIN if none
 * exist locally (reinstall / new device / first login).
 *
 * Returns:
 *  - needsPin:true + pinMode  → show the PinModal ("create" when no backup
 *                               exists, "enter" when recovering existing keys).
 *  - needsPin:false           → keys already ready.
 *
 * Callers should:
 *  - show PinModal when `needsPin` is true
 *  - call `initializeWithPin(pin)` on submit
 *  - call `skip()` on cancel (history will NOT be restored)
 */
export function useKeySetup() {
  const [needsPin, setNeedsPin] = useState(false);
  const [pinMode, setPinMode] = useState<"create" | "enter">("enter");
  const [busy, setBusy] = useState(false);

  const setUpKeys = useCallback(async (): Promise<boolean> => {
    const privateKey = await getPrivateKey("privateKey");
    const publicKey = await getPublicKey("publicKey");

    if (privateKey && publicKey) {
      // Local keys exist. Re-assert the public key on the server: after a
      // server reset the stored publicKey is NULL, and without it the app
      // hits 404s when fetching keys for conversations. initializeKeys()
      // re-uploads it (the PIN arg is unused on this path).
      try {
        await initializeKeys("");
      } catch {
        // Ignore — offline or server hiccup; keys will re-sync next time.
      }
      setNeedsPin(false);
      return true;
    }

    const hasBackup = await hasKeyBackup();
    setPinMode(hasBackup ? "enter" : "create");
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
      return true;
    } catch {
      return false; // wrong PIN — caller keeps the modal open for retry
    } finally {
      setBusy(false);
    }
  }, []);

  const skip = useCallback(() => {
    setNeedsPin(false);
  }, []);

  return { needsPin, pinMode, busy, setUpKeys, initializeWithPin, skip };
}

import WelcomePage from "@/components/WelcomePage";
import SplashScreen from "@/components/SplashScreen";
import PinModal from "@/components/security/PinModal";
import { getToken } from "@/lib/auth";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { connectSocket } from "@/lib/socket";
import { useKeySetup } from "@/hooks/useKeySetup";

type AuthState = "checking" | "authenticated" | "unauthenticated";

export default function HomeScreen() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const {
    needsPin,
    pinMode,
    busy: pinBusy,
    setUpKeys,
    submitPin,
    skip: skipPin,
  } = useKeySetup();
  const [pinError, setPinError] = useState<string | null>(null);

  const goToChat = () => router.replace("/chat");

  useEffect(() => {
    const checkToken = async () => {
      const token = await getToken("token");

      if (token) {
        // Authenticated. Check for local keys — if none exist (new user or
        // new device/reinstall), we show the recovery PIN modal right here.
        try {
          const ready = await setUpKeys();
          if (!ready) {
            setAuthState("authenticated"); // stays on splash, shows PinModal
            return;
          }
        } catch {
          // Key check failed (offline etc.) — proceed to chat.
        }
        await connectSocket().catch(() => {});
        goToChat();
      } else {
        setAuthState("unauthenticated");
      }
    };

    checkToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authState !== "unauthenticated") {
    return (
      <>
        <SplashScreen />
        <PinModal
          visible={needsPin}
          mode={pinMode}
          error={pinError}
          loading={pinBusy}
          onSubmit={async (pin) => {
            const res = await submitPin(pin);
            if (!res.ok) {
              setPinError(res.error || "Incorrect PIN. Please try again.");
              return;
            }
            setPinError(null);
            await connectSocket().catch(() => {});
            goToChat();
          }}
          onCancel={() => {
            skipPin();
            setTimeout(() => {
              connectSocket().catch(() => {});
              goToChat();
            }, 300);
          }}
        />
      </>
    );
  }

  return <WelcomePage />;
}

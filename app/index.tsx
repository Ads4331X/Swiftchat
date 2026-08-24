import WelcomePage from "@/components/WelcomePage";
import SplashScreen from "@/components/SplashScreen";
import { getToken } from "@/lib/secureStorage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { connectSocket } from "@/lib/socket";

type AuthState = "checking" | "authenticated" | "unauthenticated";

export default function HomeScreen() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    const checkToken = async () => {
      const token = await getToken("token");
      await connectSocket();
      if (token) {
        // Replace so back button won't bring them here
        router.replace("/chat");
        // Keep showing splash while navigation completes
      } else {
        setAuthState("unauthenticated");
      }
    };

    checkToken();
  }, [router]);

  // Show splash while checking auth OR while navigating to /chat
  if (authState === "checking" || authState === "authenticated") {
    return <SplashScreen />;
  }

  return <WelcomePage />;
}

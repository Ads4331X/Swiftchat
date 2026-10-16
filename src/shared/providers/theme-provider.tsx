import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "@/shared/hooks/use-color-scheme";
import {
  AttachmentColors,
  Colors,
  getAttachmentColors,
  getFormColors,
} from "@/shared/theme/theme";
import { getSetting, setSetting } from "@/core/db";
import { Appearance } from "@/app/settings/appearance";

export type AppTheme = {
  colorScheme: "light" | "dark";
  isDark: boolean;
  colors: (typeof Colors)["light"];
  subtleText: string;
  inputBorderColor: string;
  inputBg: string;
  placeholderColor: string;
  dividerColor: string;
  setAppearance: (appearance: Appearance) => Promise<void>;
  attachmentColors: (isMine?: boolean) => AttachmentColors;
};

const ThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");

  const loadAppearance = useCallback(async () => {
    const savedAppearance = await getSetting("appearance");
    const appearance = savedAppearance ?? "system";

    if (appearance === "light") {
      return "light";
    }

    if (appearance === "dark") {
      return "dark";
    }

    return systemColorScheme === "dark" ? "dark" : "light";
  }, [systemColorScheme]);

  const setAppearance = useCallback(
    async (appearance: Appearance) => {
      await setSetting("appearance", appearance);

      if (appearance === "light") {
        setColorScheme("light");
      } else if (appearance === "dark") {
        setColorScheme("dark");
      } else {
        setColorScheme(systemColorScheme === "dark" ? "dark" : "light");
      }
    },
    [systemColorScheme],
  );

  useEffect(() => {
    let active = true;

    loadAppearance().then((saved) => {
      if (active) setColorScheme(saved);
    });

    return () => {
      active = false;
    };
  }, [loadAppearance]);

  const isDark = colorScheme === "dark";

  // Stable identity so consumers can reference it as a dependency safely.
  const attachmentColors = useCallback(
    (isMine = false) => getAttachmentColors(colorScheme, isMine),
    [colorScheme],
  );

  // Memoized so the context value has a stable identity — a fresh object
  // every render would re-render all ~50 useTheme() consumers on each change.
  const theme: AppTheme = useMemo(
    () => ({
      colorScheme,
      isDark,
      colors: Colors[colorScheme],
      ...getFormColors(colorScheme),
      setAppearance,
      attachmentColors,
    }),
    [colorScheme, isDark, setAppearance, attachmentColors],
  );

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error("useTheme must be used within an AppThemeProvider");
  }

  return ctx;
}

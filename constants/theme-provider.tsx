import { createContext, useContext, useEffect, useState } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, getFormColors } from "@/constants/theme";
import { getSetting, setSetting } from "@/lib/db";
import { Appearance } from "@/app/appearance";

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
};

const ThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorScheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    async function load() {
      const savedColorScheme = await loadAppearance();
      setColorScheme(savedColorScheme);
    }

    load();
  }, [systemColorScheme]);
  const loadAppearance = async () => {
    const savedAppearance = await getSetting("appearance");
    const appearance = savedAppearance ?? "system";

    if (appearance === "light") {
      return "light";
    }

    if (appearance === "dark") {
      return "dark";
    }

    return systemColorScheme === "dark" ? "dark" : "light";
  };
  const setAppearance = async (appearance: Appearance) => {
    await setSetting("appearance", appearance);

    if (appearance === "light") {
      setColorScheme("light");
    } else if (appearance === "dark") {
      setColorScheme("dark");
    } else {
      setColorScheme(systemColorScheme === "dark" ? "dark" : "light");
    }
  };

  const isDark = colorScheme === "dark";

  const theme: AppTheme = {
    colorScheme,
    isDark,
    colors: Colors[colorScheme],
    ...getFormColors(colorScheme),
    setAppearance,
  };

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

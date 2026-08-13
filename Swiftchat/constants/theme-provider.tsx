import { createContext, useContext } from "react";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, getFormColors } from "@/constants/theme";

export type AppTheme = {
  colorScheme: "light" | "dark";
  isDark: boolean;
  colors: (typeof Colors)["light"];
  subtleText: string;
  inputBorderColor: string;
  inputBg: string;
  placeholderColor: string;
  dividerColor: string;
};

const ThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const theme: AppTheme = {
    colorScheme,
    isDark,
    colors: Colors[colorScheme],
    ...getFormColors(colorScheme),
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

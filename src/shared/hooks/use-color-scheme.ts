import { useColorScheme as useSystemColorScheme } from "react-native";

export function useColorScheme(): "light" | "dark" {
  return useSystemColorScheme() ?? "light";
}

import { Pressable, Text, View } from "react-native";

const MODES = ["picture", "video"] as const;

type ModeSwitchProps = {
  mode: "picture" | "video";
  onModeChange: (mode: "picture" | "video") => void;
};

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <View className="mb-7 flex-row gap-1.5 rounded-full bg-black/45 p-1.5">
      {MODES.map((m) => {
        const selected = mode === m;

        return (
          <Pressable
            key={m}
            onPress={() => onModeChange(m)}
            accessibilityRole="button"
            accessibilityLabel={m === "picture" ? "Photo mode" : "Video mode"}
            accessibilityState={{ selected }}
            className={`rounded-full px-7 py-2.5 ${
              selected ? "bg-white" : ""
            }`}
          >
            <Text
              className={`text-sm font-bold tracking-wider ${
                selected ? "text-black" : "text-white"
              }`}
            >
              {m === "picture" ? "PHOTO" : "VIDEO"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

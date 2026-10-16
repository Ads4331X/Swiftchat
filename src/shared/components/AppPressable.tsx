import { useState } from "react";
import { Pressable, type PressableProps } from "react-native";

type Props = Omit<PressableProps, "style"> & {
  style?: PressableProps["style"];
};

// nativewind wraps Pressable and never calls the style callback, so any style
// returned from it (background, border, size) is lost on native. resolve the
// callback here and hand a plain style to the real Pressable instead.
export function AppPressable({ style, onPressIn, onPressOut, ...props }: Props) {
  const [pressed, setPressed] = useState(false);

  const resolved =
    typeof style === "function"
      ? style({ pressed, hovered: false })
      : style;

  return (
    <Pressable
      {...props}
      style={resolved}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
    />
  );
}

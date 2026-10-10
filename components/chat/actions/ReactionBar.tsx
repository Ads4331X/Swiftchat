import { type SharedValue } from "react-native-reanimated";
import { REACTIONS } from "./constants";
import { ReactionEmoji } from "./ReactionEmoji";

type ReactionBarProps = {
  scales: SharedValue<number>[];
  onReact: (emoji: string, index: number) => void;
};

export function ReactionBar({ scales, onReact }: ReactionBarProps) {
  return (
    <>
      {REACTIONS.map((emoji, i) => (
        <ReactionEmoji
          key={i}
          emoji={emoji}
          scaleValue={scales[i]}
          onPress={() => onReact(emoji, i)}
        />
      ))}
    </>
  );
}

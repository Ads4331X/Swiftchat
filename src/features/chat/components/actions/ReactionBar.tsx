import { type SharedValue } from "react-native-reanimated";
import { REACTIONS } from "@/features/chat/components/actions/constants";
import { ReactionEmoji } from "@/features/chat/components/actions/ReactionEmoji";

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

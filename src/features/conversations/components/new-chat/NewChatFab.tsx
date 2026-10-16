import { Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type NewChatFabProps = {
  onPress?: () => void;
};

export default function NewChatFab({ onPress }: NewChatFabProps) {
  return (
    <Pressable
      onPress={onPress}
      className="w-16 h-16 items-center justify-center rounded-2xl bg-[#29A195] active:opacity-90 relative"
    >
      <MaterialIcons name="add" size={50} color="#FFFFFF" />
    </Pressable>
  );
}

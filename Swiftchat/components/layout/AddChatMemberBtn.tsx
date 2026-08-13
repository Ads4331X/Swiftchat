import { Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

type AddChatMemberBtnProps = {
  onPress?: () => void;
};

export default function AddChatMemberBtn({ onPress }: AddChatMemberBtnProps) {
  return (
    <Pressable
      onPress={onPress}
      className="w-16 h-16 items-center justify-center rounded-2xl bg-[#29A195] active:opacity-90  relative "
    >
      <MaterialIcons name="add" size={50} color="#FFFFFF" />
    </Pressable>
  );
}

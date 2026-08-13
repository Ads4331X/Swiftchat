import { Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";
import ResultActionButton from "./ResultActionButton";

type SearchResultCardProps = {
  title: string;
  onChat: () => void;
  onCall?: () => void;
  onVideo?: () => void;
};

export default function SearchResultCard({
  title,
  onChat,
  onCall,
  onVideo,
}: SearchResultCardProps) {
  const theme = useTheme();
  const colors = theme.colors;
  const { inputBorderColor } = theme;

  return (
    <View
      className="mt-4 rounded-2xl border p-4"
      style={{
        borderColor: "#29A195",
        backgroundColor: "rgba(41, 161, 149, 0.1)",
      }}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: "#29A195" }}
        >
          <Feather name="user" size={22} color="#FFFFFF" />
        </View>

        <View className="flex-1">
          <Text
            style={{ color: colors.text }}
            className="font-semibold text-base"
          >
            {title}
          </Text>
        </View>
      </View>

      <View
        className="flex-row justify-around items-center mt-4 pt-4 border-t"
        style={{ borderTopColor: inputBorderColor }}
      >
        <ResultActionButton
          icon="message-circle"
          color="#29A195"
          label="Chat"
          onPress={onChat}
        />
        <ResultActionButton
          icon="phone"
          color="#25D366"
          label="Call"
          onPress={onCall}
        />
        <ResultActionButton
          icon="video"
          color="#7C3AED"
          label="Video"
          onPress={onVideo}
        />
      </View>
    </View>
  );
}

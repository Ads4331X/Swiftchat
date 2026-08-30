import { View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { memo } from "react";

type ReadReceiptsProps = {
  isPending: boolean;
  isRead: boolean;
  color: string;
};

/**
 * WhatsApp-style delivery/read receipt ticks:
 *  - sending : a clock icon
 *  - sent    : a single check
 *  - read    : a double check (back check slightly offset and dimmer)
 */
export const ReadReceipts = memo(function ReadReceipts({
  isPending,
  isRead,
  color,
}: ReadReceiptsProps) {
  if (isPending) {
    return <Feather name="clock" size={11} color={color} />;
  }

  if (isRead) {
    return (
      <View className="flex-row items-end" style={{ width: 18, height: 11 }}>
        <Feather
          name="check"
          size={11}
          color={color}
          style={{ opacity: 0.55, marginRight: -2 }}
        />
        <Feather name="check" size={11} color={color} />
      </View>
    );
  }

  return <Feather name="check" size={11} color={color} />;
});

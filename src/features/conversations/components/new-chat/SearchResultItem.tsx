import { ActivityIndicator } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/shared/theme/theme";
import { UserListItem } from "@/features/chat/components/common";

type SearchResultItemProps = {
  username: string;
  onPress: () => void;
  loading?: boolean;
  actionIcon?: React.ComponentProps<typeof Feather>["name"];
};

export default function SearchResultItem({
  username,
  onPress,
  loading = false,
  actionIcon = "message-circle",
}: SearchResultItemProps) {
  return (
    <UserListItem
      username={username}
      onPress={onPress}
      disabled={loading}
      trailing={
        loading ? (
          <ActivityIndicator size="small" color={BRAND_COLOR} />
        ) : (
          <Feather name={actionIcon} size={20} color={BRAND_COLOR} />
        )
      }
    />
  );
}

import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { BRAND_COLOR } from "@/constants/theme";
import Avatar from "@/components/profile/Avatar";

type OtherProfileHeaderProps = {
  username?: string;
  avatar?: string;
  presence: string;
  textColor: string;
  mutedColor: string;
  onVideoCall: () => void;
  onAudioCall: () => void;
  onSearch: () => void;
};

export default function OtherProfileHeader({
  username,
  avatar,
  presence,
  textColor,
  mutedColor,
  onVideoCall,
  onAudioCall,
  onSearch,
}: OtherProfileHeaderProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View>
      <View className="flex-row items-center px-2 pt-3">
        <Pressable onPress={goBack} hitSlop={10} className="p-2">
          <Feather name="arrow-left" size={24} color={textColor} />
        </Pressable>
      </View>

      <View className="items-center mt-2 gap-1.5">
        <Avatar username={username ?? "?"} avatarUrl={avatar} size={76} />
        <Text
          style={{ color: textColor }}
          className="font-semibold text-[21px] mt-2"
        >
          {username ?? "Unknown user"}
        </Text>
        <Text style={{ color: mutedColor }} className="text-[13px]">
          {presence}
        </Text>
      </View>

      <View className="flex-row justify-center gap-8 mt-6 px-5">
        <HeaderAction
          icon="video"
          label="Video"
          mutedColor={mutedColor}
          onPress={onVideoCall}
        />
        <HeaderAction
          icon="phone"
          label="Audio"
          mutedColor={mutedColor}
          onPress={onAudioCall}
        />
        <HeaderAction
          icon="search"
          label="Search"
          mutedColor={mutedColor}
          onPress={onSearch}
        />
      </View>
    </View>
  );
}

function HeaderAction({
  icon,
  label,
  mutedColor,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  mutedColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="items-center"
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
      android_ripple={{ color: mutedColor, borderless: true }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ width: 48, height: 48, backgroundColor: BRAND_COLOR + "1a" }}
      >
        <Feather name={icon} size={20} color={BRAND_COLOR} />
      </View>
      <Text style={{ color: mutedColor }} className="text-xs mt-1.5">
        {label}
      </Text>
    </Pressable>
  );
}

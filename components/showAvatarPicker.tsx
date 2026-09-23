import { launchCamera, launchGallery } from "../lib/avatar";
import { useCallback } from "react";
import { View, Text, Pressable, useColorScheme, Platform } from "react-native";
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useTheme } from "@/constants/theme-provider";
import { getFormColors } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
export function AvatarPreviewModal({
  ref: bottomSheetRef,
  closeSheet,
}: {
  closeSheet: () => void;
  ref: React.RefObject<BottomSheet | null>;
}) {
  const theme = useTheme();
  const colors = theme.colors;
  const colorScheme = useColorScheme();
  const formColors = getFormColors(colorScheme);

  const handleClosePress = () => {
    if (bottomSheetRef.current) {
      bottomSheetRef.current.close();
    }
  };

  const options = [
    {
      label: "Take Photo",
      icon: "camera",
      onPress: launchCamera,
      disabled: Platform.OS === "web",
    },
    {
      label: "Choose from Gallery",
      icon: "image",
      onPress: launchGallery,
      disabled: false,
    },
  ];
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );
  return (
    <BottomSheet
      ref={bottomSheetRef}
      onClose={closeSheet}
      index={-1}
      enableDynamicSizing
      handleStyle={{ alignItems: "center" }}
      backgroundStyle={{ backgroundColor: "transparent" }}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView style={{ alignItems: "center", paddingBottom: 24 }}>
        {/* Options card */}
        <View
          style={{
            width: "90%",
            backgroundColor: colors.background,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {options.map((option, i) => (
            <Pressable
              key={option.label}
              disabled={option.disabled}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderTopWidth: i === 0 ? 1 : 0,
                borderTopColor: formColors.dividerColor,
                backgroundColor:
                  pressed && !option.disabled
                    ? formColors.inputBg
                    : "transparent",
                opacity: option.disabled ? 0.4 : 1,
              })}
              android_ripple={
                option.disabled ? undefined : { color: formColors.dividerColor }
              }
              onPress={option.disabled ? undefined : option.onPress}
            >
              <Feather
                name={option.icon as any}
                size={18}
                color={colors.icon}
              />
              <Text style={{ color: colors.text, fontSize: 16 }}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Gap */}
        <View style={{ height: 8 }} />

        {/* Cancel — separate card */}
        <View
          style={{
            width: "90%",
            backgroundColor: colors.background,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <Pressable
            style={({ pressed }) => ({
              paddingVertical: 14,
              backgroundColor: pressed ? formColors.inputBg : "transparent",
            })}
            android_ripple={{ color: formColors.dividerColor }}
            onPress={handleClosePress}
          >
            <Text
              className="text-center font-semibold"
              style={{ color: colors.text, fontSize: 16 }}
            >
              Cancel
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

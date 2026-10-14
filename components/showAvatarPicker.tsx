import { launchCamera, launchGallery } from "@/lib/avatar";
import { useCallback, forwardRef } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { AppPressable as Pressable } from "@/components/ui/AppPressable";
import BottomSheet, {
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useTheme } from "@/constants/theme-provider";
import { Feather } from "@expo/vector-icons";
import { ImagePickerSuccessResult } from "expo-image-picker";


export const AvatarPreviewModal = forwardRef<
  BottomSheet,
  {
    closeSheet: () => void;
    onSelectImage?: (uri: ImagePickerSuccessResult | null) => void;
  }
>(function AvatarPreviewModal({ closeSheet, onSelectImage }, bottomSheetRef) {
  const theme = useTheme();
  const colors = theme.colors;

  const handleClosePress = () => {
    if (
      bottomSheetRef &&
      "current" in bottomSheetRef &&
      bottomSheetRef.current
    ) {
      bottomSheetRef.current.close();
    } else {
      closeSheet();
    }
  };

  const handleOptionPress = async (
    action: () => Promise<ImagePickerSuccessResult | null>,
  ) => {
    handleClosePress();
    const result = await action();

    if (onSelectImage) {
      onSelectImage(result);
    }
  };

  const options = [
    {
      label: "Take Photo",
      subtitle: Platform.OS === "web" ? "Not available on web" : undefined,
      icon: "camera",
      onPress: () => handleOptionPress(launchCamera),
      disabled: Platform.OS === "web",
    },
    {
      label: "Choose from Gallery",
      subtitle: undefined,
      icon: "image",
      onPress: () => handleOptionPress(launchGallery),
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

  const cardBg = theme.isDark ? "#242729" : "#FFFFFF";
  const pressBg = theme.isDark ? "#2D3133" : "#F3F4F6";
  const disabledBg = theme.isDark ? "#1C1E1F" : "#F9FAFB";

  return (
    <BottomSheet
      ref={bottomSheetRef}
      onClose={closeSheet}
      index={0}
      enableDynamicSizing
      handleIndicatorStyle={{ display: "none" }}
      backgroundStyle={{ backgroundColor: "transparent" }}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView style={styles.content}>
        {/* Options card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: theme.dividerColor,
            },
          ]}
        >
          {options.map((option, i) => {
            const contentColor = option.disabled
              ? theme.subtleText
              : colors.text;
            const iconColor = option.disabled ? theme.subtleText : colors.icon;

            return (
              <Pressable
                key={option.label}
                disabled={option.disabled}
                className="flex-1 justify-start items-center p-4 flex-row gap-2"
                style={({ pressed }) => [
                  styles.optionButton,
                  {
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: theme.dividerColor,
                    backgroundColor: option.disabled
                      ? disabledBg
                      : pressed
                        ? pressBg
                        : "transparent",
                  },
                ]}
                android_ripple={
                  option.disabled ? undefined : { color: theme.dividerColor }
                }
                onPress={option.onPress}
              >
                <Feather
                  name={option.icon as any}
                  size={20}
                  color={iconColor}
                />

                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, { color: contentColor }]}>
                    {option.label}
                  </Text>
                  {option.subtitle && (
                    <Text
                      style={[
                        styles.optionSubtitle,
                        { color: theme.subtleText },
                      ]}
                    >
                      {option.subtitle}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Cancel */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: theme.dividerColor,
              marginTop: 10,
            },
          ]}
        >
          <Pressable
            className="flex-1 justify-center items-center p-4 flex-row gap-2"
            style={({ pressed }) => [
              styles.cancelButton,
              {
                backgroundColor: pressed ? pressBg : "transparent",
              },
            ]}
            android_ripple={{ color: theme.dividerColor }}
            onPress={handleClosePress}
          >
            <Text style={[styles.cancelText, { color: colors.text }]}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  optionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
});

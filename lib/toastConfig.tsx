// lib/toastConfig.tsx
import React from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { ToastConfigParams } from "react-native-toast-message";
import AntDesign from "@expo/vector-icons/AntDesign";

type Variant = "success" | "error" | "warning" | "info";

const VARIANTS: Record<
  Variant,
  {
    bg: string;
    accent: string;
    icon: keyof typeof AntDesign.glyphMap;
    role: "alert" | "status";
    muted: string;
  }
> = {
  success: {
    bg: "#0F2E2A",
    accent: "#00A896",
    icon: "check",
    role: "status",
    muted: "#B8C4C2",
  },
  error: {
    bg: "#2E1414",
    accent: "#E5484D",
    icon: "close",
    role: "alert",
    muted: "#D9B8B8",
  },
  warning: {
    bg: "#2E2611",
    accent: "#F5A623",
    icon: "warning",
    role: "alert",
    muted: "#C9BFA0",
  },
  info: {
    bg: "#16202E",
    accent: "#7DA8E8",
    icon: "info",
    role: "status",
    muted: "#A9BBD1",
  },
};

function ToastCard({
  type,
  text1,
  text2,
  onPress,
  hide,
  props,
}: ToastConfigParams<any>) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const v = VARIANTS[type as Variant] ?? VARIANTS.info;
  const actionLabel = props?.actionLabel as string | undefined;
  const action = props?.action as (() => void) | undefined;

  const handleAction = () => {
    action?.();
    hide();
  };

  return (
    <Pressable
      accessibilityRole={v.role === "alert" ? "alert" : "none"}
      accessibilityLiveRegion={v.role === "alert" ? "assertive" : "polite"}
      onPress={onPress}
      style={{
        width: isDesktop ? undefined : "90%",
        minWidth: 280,
        maxWidth: 400,
        alignSelf: isDesktop ? "flex-end" : "center",
        marginRight: isDesktop ? 24 : 0,
        backgroundColor: v.bg,
        borderLeftWidth: 4,
        borderLeftColor: v.accent,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
      }}
    >
      <View style={{ marginRight: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: v.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <AntDesign name={v.icon} size={20} color="white" />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
          {text1}
        </Text>
        {text2 ? (
          <Text style={{ color: v.muted, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
            {text2}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleAction}
          style={{ marginLeft: 16 }}
        >
          <Text style={{ color: v.accent, fontSize: 14, fontWeight: "600" }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={() => hide()}
        hitSlop={8}
        style={{ marginLeft: 12 }}
      >
        <AntDesign name="close" size={16} color="rgba(255,255,255,0.45)" />
      </Pressable>
    </Pressable>
  );
}

export const toastConfig = {
  success: (props: ToastConfigParams<any>) => <ToastCard {...props} />,
  error: (props: ToastConfigParams<any>) => <ToastCard {...props} />,
  warning: (props: ToastConfigParams<any>) => <ToastCard {...props} />,
  info: (props: ToastConfigParams<any>) => <ToastCard {...props} />,
};
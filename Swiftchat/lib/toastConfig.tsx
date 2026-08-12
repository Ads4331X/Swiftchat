// lib/toastConfig.tsx
import React from "react";
import { View, Text } from "react-native";
import { BaseToastProps } from "react-native-toast-message";
import AntDesign from "@expo/vector-icons/AntDesign";

const SuccessToast = ({ text1, text2 }: BaseToastProps) => (
  <View
    style={{
      width: "90%",
      backgroundColor: "#0F2E2A",
      borderLeftWidth: 4,
      borderLeftColor: "#00A896",
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    }}
  >
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#00A896",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AntDesign name="check" size={18} color="white" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
        {text1}
      </Text>
      {text2 ? (
        <Text style={{ color: "#B8C4C2", fontSize: 13, marginTop: 2 }}>
          {text2}
        </Text>
      ) : null}
    </View>
  </View>
);

const ErrorToast = ({ text1, text2 }: BaseToastProps) => (
  <View
    style={{
      width: "90%",
      backgroundColor: "#2E1414",
      borderLeftWidth: 4,
      borderLeftColor: "#E5484D",
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    }}
  >
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#E5484D",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AntDesign name="close" size={18} color="white" />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
        {text1}
      </Text>
      {text2 ? (
        <Text style={{ color: "#D9B8B8", fontSize: 13, marginTop: 2 }}>
          {text2}
        </Text>
      ) : null}
    </View>
  </View>
);

export const toastConfig = {
  success: (props: BaseToastProps) => <SuccessToast {...props} />,
  error: (props: BaseToastProps) => <ErrorToast {...props} />,
};

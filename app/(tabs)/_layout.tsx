import { Tabs } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { useTheme } from "@/constants/theme-provider";

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint ?? "#29A195",
        tabBarStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-circle" color={color} size={size} />
          ),
        }}
      />

      <Tabs.Screen
        name="usersetting"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}

import { View, Text } from "react-native";
import type { ChatCategory } from "./PillsNav";
import { useEffect, useState } from "react";

type ChatMember = {
  userId: number;
};

type Chat = {
  id: number;
  members: ChatMember[];
};

export default function ChatList() {
  useEffect(() => {
    async function fetchChatLists(userId: number) {}
  }, []);
  const [chats, setChats] = useState<Chat[]>([]);
}

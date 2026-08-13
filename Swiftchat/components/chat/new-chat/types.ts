export type NewChatResult = {
  type: "success" | "error";
  title: string;
  message?: string;
  username?: string;
};

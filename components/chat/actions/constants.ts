import { Dimensions } from "react-native";
import { Easing as REasing } from "react-native-reanimated";

export const SCREEN = Dimensions.get("window");

export const REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;
export const REACTION_SIZE = 44;
export const REACTION_GAP = 4;
export const REACTION_BAR_PADDING_H = 12;
export const REACTION_BAR_HEIGHT = REACTION_SIZE + REACTION_BAR_PADDING_H * 2;
export const REACTION_BAR_WIDTH =
  REACTIONS.length * REACTION_SIZE +
  (REACTIONS.length - 1) * REACTION_GAP +
  REACTION_BAR_PADDING_H * 2;

export const MENU_WIDTH = 200;
export const MENU_ROW_HEIGHT = 44;
export const MENU_PADDING_V = 6;
export const FLOAT_GAP = 10;
export const SCREEN_PAD = 12;

export const EXIT_DURATION = 120;
export const EXIT_EASING = REasing.out(REasing.cubic);
export const ENTER_DURATION = 120;
export const ENTER_EASING = REasing.out(REasing.quad);

// shared surface color so the reaction bar and menu read as one panel
export const SURFACE_COLOR = "rgba(40,40,40,0.6)";

export const reactionBarStyle = {
  width: REACTION_BAR_WIDTH,
  height: REACTION_BAR_HEIGHT,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  paddingHorizontal: REACTION_BAR_PADDING_H,
  gap: REACTION_GAP,
  backgroundColor: SURFACE_COLOR,
  borderRadius: 28,
  overflow: "hidden" as const,
  shadowColor: "#000",
  shadowOpacity: 0.35,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 12,
};

export const menuStyle = {
  width: MENU_WIDTH,
  backgroundColor: SURFACE_COLOR,
  borderRadius: 16,
  overflow: "hidden" as const,
  shadowColor: "#000",
  shadowOpacity: 0.4,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 10 },
  elevation: 14,
  paddingVertical: MENU_PADDING_V,
};

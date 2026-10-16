import { type Position } from "@/features/chat/types";
import {
  FLOAT_GAP,
  MENU_PADDING_V,
  MENU_ROW_HEIGHT,
  MENU_WIDTH,
  REACTION_BAR_HEIGHT,
  REACTION_BAR_WIDTH,
  SCREEN,
  SCREEN_PAD,
} from "@/features/chat/components/actions/constants";

export type Layout = {
  groupTop: number;
  groupHeight: number;
  menuHeight: number;
  copyHeight: number;
  reactionLeft: number;
  menuLeft: number;
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

export function menuRowsFor(isGroup: boolean, isMine: boolean): string[] {
  if (isGroup) {
    return isMine
      ? ["reply", "edit", "copy", "forward", "pin", "info", "delete"]
      : ["reply", "copy", "forward", "pin", "info"];
  }
  return isMine
    ? ["reply", "edit", "copy", "forward", "pin", "delete"]
    : ["reply", "copy", "forward", "pin"];
}

export function computeLayout(
  p: Position,
  isMine: boolean,
  isGroup: boolean,
): Layout {
  const menuHeight =
    menuRowsFor(isGroup, isMine).length * MENU_ROW_HEIGHT +
    MENU_PADDING_V * 2;

  // Cap how tall the floating bubble copy may be so the menu stays visible
  // even for very long messages: what's left of the screen after the reaction
  // bar, menu, gaps and padding are reserved.
  const availableCopy = Math.max(
    0,
    SCREEN.height -
      2 * SCREEN_PAD -
      REACTION_BAR_HEIGHT -
      FLOAT_GAP * 2 -
      menuHeight,
  );
  const copyHeight = Math.min(p.height, availableCopy);

  // Real measured bubble height — no phantom min-height, so the spacing
  // between the reaction bar / bubble / menu is always consistent.
  const groupHeight =
    REACTION_BAR_HEIGHT + FLOAT_GAP + copyHeight + FLOAT_GAP + menuHeight;

  // Anchor so the floating bubble lands exactly where the original message
  // sits; only shift the whole group when it wouldn't fit on screen.
  const unclampedGroupTop = p.pageY - REACTION_BAR_HEIGHT - FLOAT_GAP;
  const maxGroupTop = Math.max(
    SCREEN_PAD,
    SCREEN.height - groupHeight - SCREEN_PAD,
  );
  const groupTop = clamp(unclampedGroupTop, SCREEN_PAD, maxGroupTop);

  // Anchor the reaction bar to the bubble's OUTER edge — for incoming messages
  // (left side) hug the bubble's left edge, for mine (right side) hug the
  // right edge. Centering under the bubble would push the emojis far away
  // from a short bubble that sits at a screen edge.
  const reactionLeft = clamp(
    isMine
      ? p.pageX + p.width - REACTION_BAR_WIDTH
      : p.pageX,
    SCREEN_PAD,
    SCREEN.width - REACTION_BAR_WIDTH - SCREEN_PAD,
  );

  const menuLeft = clamp(
    p.pageX + p.width / 2 > SCREEN.width / 2
      ? p.pageX + p.width - MENU_WIDTH
      : p.pageX,
    SCREEN_PAD,
    SCREEN.width - MENU_WIDTH - SCREEN_PAD,
  );

  return {
    groupTop,
    groupHeight,
    menuHeight,
    copyHeight,
    reactionLeft,
    menuLeft,
  };
}

// Pure notch state machine (SPEC-notch-shell.md §5.2). Timers and native calls live in the React hook;
// this module only decides the next state and which side effects to run.

export type OpenMode = "hover" | "click" | "always";

export type VisualState = "pill" | "always" | "expanded";

export interface NotchState {
  expanded: boolean;
  /** Pointer is over the notch (hover mode waits for the delay before opening). */
  hovering: boolean;
}

export type CloseReason = "escape" | "collapseButton" | "clickOutside";

export type NotchEvent =
  | { type: "pointerEnter" }
  | { type: "pointerLeave" }
  | { type: "hoverElapsed" }
  | { type: "clickPill" }
  | { type: "close"; reason: CloseReason }
  | { type: "modeChanged" };

export type NotchEffect = "startHoverTimer" | "cancelHoverTimer";

export interface Transition {
  state: NotchState;
  effects: NotchEffect[];
}

export const HOVER_DELAY_MS = 250;

export const initialNotchState: NotchState = { expanded: false, hovering: false };

const stay = (state: NotchState): Transition => ({ state, effects: [] });

export function notchReducer(state: NotchState, event: NotchEvent, mode: OpenMode): Transition {
  switch (event.type) {
    case "pointerEnter":
      if (mode !== "hover" || state.hovering) return stay(state);
      return {
        state: { ...state, hovering: true },
        effects: state.expanded ? [] : ["startHoverTimer"],
      };

    case "pointerLeave":
      if (mode !== "hover") return stay(state);
      return {
        state: { expanded: false, hovering: false },
        effects: state.expanded ? [] : ["cancelHoverTimer"],
      };

    case "hoverElapsed":
      if (mode !== "hover" || !state.hovering || state.expanded) return stay(state);
      return { state: { ...state, expanded: true }, effects: [] };

    case "clickPill":
      if (state.expanded) return stay(state);
      return {
        state: { ...state, expanded: true },
        effects: mode === "hover" && state.hovering ? ["cancelHoverTimer"] : [],
      };

    case "close":
      if (!state.expanded) return stay(state);
      return { state: { ...state, expanded: false }, effects: [] };

    case "modeChanged":
      return { state: initialNotchState, effects: state.hovering ? ["cancelHoverTimer"] : [] };
  }
}

export function visualState(state: NotchState, mode: OpenMode): VisualState {
  if (state.expanded) return "expanded";
  return mode === "always" ? "always" : "pill";
}

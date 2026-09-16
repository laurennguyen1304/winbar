import { useCallback, useEffect, useRef, useState } from "react";
import {
  HOVER_DELAY_MS,
  initialNotchState,
  notchReducer,
  visualState,
  type NotchEvent,
  type NotchState,
  type OpenMode,
} from "./notch-machine";

/** Runs the pure notch machine and owns its side effects (the hover timer). */
export function useNotchMachine(mode: OpenMode, hasAlert = false) {
  const [state, setState] = useState<NotchState>(initialNotchState);
  const stateRef = useRef(state);
  const modeRef = useRef(mode);
  const alertRef = useRef(hasAlert);
  useEffect(() => {
    alertRef.current = hasAlert;
  }, [hasAlert]);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dispatch = useCallback(function send(event: NotchEvent) {
    const { state: next, effects } = notchReducer(stateRef.current, event, modeRef.current, alertRef.current);
    for (const effect of effects) {
      clearTimeout(hoverTimer.current);
      if (effect === "startHoverTimer") {
        hoverTimer.current = setTimeout(() => send({ type: "hoverElapsed" }), HOVER_DELAY_MS);
      }
    }
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;
    dispatch({ type: "modeChanged" });
  }, [mode, dispatch]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  return { state, visual: visualState(state, mode, hasAlert), dispatch };
}

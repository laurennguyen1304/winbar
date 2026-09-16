import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { createShell, type Shell, type ShellSnapshot } from "./shell";
import type { ShellApi } from "./widget-contract";

const defaultShell = createShell();
const ShellContext = createContext<Shell>(defaultShell);

export function ShellProvider({ shell, children }: { shell: Shell; children: ReactNode }) {
  return <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>;
}

/** What widgets use: push/dismiss alerts, flash the pill, open or collapse the panel. */
export function useShell(): ShellApi {
  return useContext(ShellContext).api;
}

/** Shell internals for the notch itself. */
export function useShellRuntime(): { shell: Shell; snapshot: ShellSnapshot } {
  const shell = useContext(ShellContext);
  const snapshot = useSyncExternalStore(shell.subscribe, shell.getSnapshot);
  return { shell, snapshot };
}

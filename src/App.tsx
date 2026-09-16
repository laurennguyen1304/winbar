import type { OpenMode } from "./shell/notch-machine";
import { Notch } from "./shell/Notch";

// Until Settings (Task 8): try other modes in dev with VITE_NOTCH_MODE=click|always.
const devMode = import.meta.env.VITE_NOTCH_MODE as OpenMode | undefined;
const mode: OpenMode = devMode === "click" || devMode === "always" ? devMode : "hover";

export default function App() {
  return <Notch mode={mode} />;
}

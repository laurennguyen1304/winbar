import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/onest";
import "@fontsource-variable/jetbrains-mono";
import "../design/tokens.css";
import "./command-bar.css";
import "../widgets";
import { registry } from "../shell/registry";
import { CommandBar } from "./CommandBar";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CommandBar registered={registry.all()} />
  </React.StrictMode>,
);

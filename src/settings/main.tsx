import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/onest";
import "@fontsource-variable/jetbrains-mono";
import "../design/tokens.css";
import "./settings.css";
import "../widgets";
import { SettingsApp } from "./SettingsApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>,
);

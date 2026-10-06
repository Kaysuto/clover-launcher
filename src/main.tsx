import { reactErrorHandler } from "@sentry/react";
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { ResizeHandles } from "./components/ResizeHandles";
import { TrayMenu } from "./components/TrayMenu";
import "./styles.css";

// Menu du navigateur (enregistrer l'image, partager…) : seulement dans les champs et sur une sélection.
document.addEventListener("contextmenu", (event) => {
  const editable = (event.target as Element).closest("input, textarea, [contenteditable]");
  if (!editable && !window.getSelection()?.toString()) event.preventDefault();
});

const trayMenu = getCurrentWindow().label === "tray-menu";
if (trayMenu) document.documentElement.dataset.surface = "tray-menu";

// Erreurs de rendu React : vers Sentry si les rapports de plantage sont acceptés, sinon ignorées.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement, { onUncaughtError: reactErrorHandler(), onCaughtError: reactErrorHandler() }).render(
  <React.StrictMode>
    {trayMenu ? <TrayMenu /> : <><App /><ResizeHandles /></>}
  </React.StrictMode>,
);

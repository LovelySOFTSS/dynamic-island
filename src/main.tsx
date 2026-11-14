import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DynamicIsland } from "./components/DynamicIsland";
import "./index.css";

// Нативное контекстное меню webview островку не нужно.
if (import.meta.env.PROD) {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

const root = document.getElementById("root");
if (!root) throw new Error("#root не найден");

createRoot(root).render(
  <StrictMode>
    <DynamicIsland />
  </StrictMode>,
);

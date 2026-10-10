import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@publisle/adapter-core/document.css";
import "@publisle/adapter-core/katex.css";
import "../../playground-core/theme.css";

const root = document.querySelector("#root");
if (!root) throw new Error("Missing #root element.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

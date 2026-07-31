import React from "react";
import ReactDOM from "react-dom/client";
import "./polyfills";
import "./modules";

import App from "./App";
import "./index.css";

import { relayNexusCallback } from "@evmcrispr/ai";

if (!relayNexusCallback()) {
  const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement,
  );
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

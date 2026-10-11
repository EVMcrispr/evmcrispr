import React from "react";
import ReactDOM from "react-dom/client";
import "./polyfills";
import "./modules";

import App from "./App";
import "./index.css";

import { relayNexusCallback } from "@evmcrispr/ai";
import { boot } from "./app/boot";

if (!relayNexusCallback()) {
  const root = document.getElementById("root") as HTMLElement;
  // Storage is opened and old scripts migrated before the first space is
  // asked for; the page has nothing to show until then.
  boot().then(
    (app) =>
      ReactDOM.createRoot(root).render(
        <React.StrictMode>
          <App app={app} />
        </React.StrictMode>,
      ),
    // Never a blank page: say what happened. Old scripts are untouched.
    (error) => {
      root.textContent = `EVMcrispr could not start (${
        error instanceof Error ? error.message : String(error)
      }). Reload the page to try again.`;
    },
  );
}

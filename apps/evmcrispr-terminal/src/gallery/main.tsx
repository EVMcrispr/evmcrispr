import "@fontsource/jetbrains-mono";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource-variable/instrument-sans";
import "../index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { Gallery } from "./Gallery";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Gallery />
  </React.StrictMode>,
);

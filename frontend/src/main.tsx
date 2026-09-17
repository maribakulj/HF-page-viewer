import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";
import "./validation.css";
import "./search.css";
import "./renderer.css";
import "./iiif.css";
import "./qcReport.css";
import "./wordEdit.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

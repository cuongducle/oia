import { createRoot } from "react-dom/client";
import App, { ErrorBoundary } from "./App.js";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

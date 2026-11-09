import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { scheduleWarmOfflineCache } from "./lib/warmCache";
import "@fontsource-variable/inter";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Production only: in development the worker would serve a stale shell over the
// dev server's own hot updates, which presents as edits silently not applying.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration costs offline support and nothing else. The app
      // works; there is nothing to tell the user.
    });
    // The pages not opened yet, saved for a start with no signal. Only beside
    // a worker: nothing else reads the store this fills.
    scheduleWarmOfflineCache();
  });
}

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

// Production only: in development the worker would serve a stale shell over hot updates.
if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration costs offline support and nothing else.
    });
    // Saves the unopened pages for a start with no signal; only beside a worker, which reads the store.
    scheduleWarmOfflineCache();
  });
}

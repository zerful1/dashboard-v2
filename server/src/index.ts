import { createApp } from "./app";
import { config } from "./config";

// Local development entry point only. In production the app is exported from
// api/index.ts and invoked by the platform; nothing here listens.
const app = createApp();

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

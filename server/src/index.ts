import { createApp } from "./app";
import { config } from "./config";

// Local development only: in production the app is exported from api/index.ts and nothing here listens.
const app = createApp();

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

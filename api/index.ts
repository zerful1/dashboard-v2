import { createApp } from "../server/src/app";

/** Vercel entry for every /api/* request; built once per warm instance, nothing request-scoped at module level. */
export default createApp();

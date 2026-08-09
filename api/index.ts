import { createApp } from "../server/src/app";

/**
 * Vercel function entry point. Every /api/* request is rewritten here.
 *
 * The app is constructed once per warm instance. That is safe because nothing
 * request-scoped lives at module scope — sessions are in Postgres and the pg pool
 * is per-instance by design.
 */
export default createApp();

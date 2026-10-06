import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The client workspace's root, for tests that read source files. Resolved from
 * cwd rather than import.meta.url, which under Vite is not a file:// URL (the
 * same reason as sw.test.ts): cwd is the repo root under
 * `npx vitest --root client` and the workspace under `npm test -w`.
 */
const ROOT = existsSync(resolve(process.cwd(), "client/src")) ? resolve(process.cwd(), "client") : process.cwd();

export const clientPath = (rel: string): string => resolve(ROOT, rel);

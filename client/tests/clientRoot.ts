import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** The client workspace's root, from cwd rather than import.meta.url, which under Vite is not a file:// URL. */
const ROOT = existsSync(resolve(process.cwd(), "client/src")) ? resolve(process.cwd(), "client") : process.cwd();

export const clientPath = (rel: string): string => resolve(ROOT, rel);

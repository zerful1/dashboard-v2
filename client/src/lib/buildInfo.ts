/**
 * The build running, stamped by rsbuild.config.ts (`source.define`). Guarded
 * with typeof so a test, which has no define, reads it as a local build.
 */
export const BUILD_SHA: string = typeof __BUILD_SHA__ === "undefined" ? "" : __BUILD_SHA__;
export const BUILD_DATE: string = typeof __BUILD_DATE__ === "undefined" ? "" : __BUILD_DATE__;

/** "Version 16 Oct · 201d09b", or "Version dev" for a build with no commit (a local one). */
export function versionText(sha: string, date: string): string {
  if (!sha) return "Version dev";
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y!, m! - 1, d!).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `Version ${day} · ${sha.slice(0, 7)}`;
}

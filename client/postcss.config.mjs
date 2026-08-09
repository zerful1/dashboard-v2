/**
 * Intentionally empty — this file exists to STOP PostCSS searching upwards.
 *
 * dashboard-v2 is nested inside the v1 project, which has its own
 * `postcss.config.cjs` loading Tailwind **v3**. PostCSS resolves config by
 * walking up the directory tree, so without this file the v1 config is found and
 * v3's plugin post-processes this client's Tailwind **v4** output — failing with
 * "`@layer base` is used but no matching `@tailwind base` directive is present".
 *
 * Tailwind v4 here is handled by @rsbuild/plugin-tailwindcss (a webpack loader),
 * not by PostCSS, so there is nothing for PostCSS to do.
 *
 * If dashboard-v2 is ever moved out to be a sibling of the v1 project, this file
 * can be deleted.
 */
export default { plugins: {} };

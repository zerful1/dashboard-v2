# AGENTS.md — client

React 19 + RSBuild + Tailwind v4. Part of the `dashboard-v2` npm workspace;
see the root `README.md` for the whole picture.

## Commands

Run from the repo root, not here:

- `npm run dev:web` — client dev server on :5173 (proxies `/api` to :3001)
- `npm run dev:api` — Express API on :3001, needed for anything authenticated
- `npm run typecheck` / `npm test` — all workspaces

## Conventions

- Entry point is `src/index.tsx`. Public env vars use the `PUBLIC_` prefix.
- **No component calls `fetch`.** Everything goes through `src/lib/api.ts`, which
  sets `credentials: 'include'` so the session cookie travels.
- Design tokens live in `src/styles.css` under Tailwind v4's `@theme`. Use the
  role names (`bg`, `surface`, `raised`, `muted`, `accent`…), never raw hex.
- `raised` (#292524) is for borders and gridlines only — never for data.
- The accent appears roughly once per screen. Semantic state uses
  `sage` / `gold` / `negative`.
- Dark only. There is no light token set.

## Docs

- Rsbuild: https://rsbuild.rs/llms.txt

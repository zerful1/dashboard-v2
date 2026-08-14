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
- The accent marks exactly three roles and nothing else: **filled** (the one
  action to take), **tinted** (the currently selected item in a set), and the
  `lbl` micro-label (identity and wayfinding chrome — wordmark, page eyebrow,
  active nav item). Anything else is not terracotta. Semantic state uses
  `sage` / `gold` / `negative`.
- **Errors: a form submission renders its own inline error next to its
  controls; everything else toasts.** Inline is `FormError` (whole-submission)
  or `Field`'s `error` (one field). Everything else — autosaves, background
  refetches, mutations — goes to the app-wide toast wired in `App.tsx`, which
  is also the only place a failed *query* can surface, since v5 has no
  per-query `onError`. A query whose page cannot render without it may render
  its own error state instead, and then it opts out with
  `meta: { errorToast: false }` so one failure is not reported twice.
- Dark only. There is no light token set.

## Docs

- Rsbuild: https://rsbuild.rs/llms.txt

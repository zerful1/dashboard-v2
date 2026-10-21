# AGENTS.md — client

React 19 + RSBuild + Tailwind v4. Part of the `dashboard-v2` npm workspace;
see the root `README.md` for the whole picture.

## Commands

Run from the repo root, not here:

- `npm run dev:web` — client dev server on :5173 (proxies `/api` to :3001)
- `npm run dev:api` — Express API on :3001, needed for anything authenticated
- `npm run typecheck` / `npm test` — all workspaces

## Conventions

- Entry point is `src/index.tsx`.
- **No component calls `fetch`.** Everything goes through `src/lib/api.ts`, which
  sets `credentials: 'include'` so the session cookie travels.
- Design tokens live in `src/styles.css` under Tailwind v4's `@theme`. Use the
  role names (`bg`, `surface`, `raised`, `muted`, `accent`…), never raw hex.
- `raised` (#1c1c1c) is for hairlines and gridlines only — never for data.
  `edge` (#333333) outlines controls: inputs, outline buttons, unticked rings.
- White is the only accent (the 2026-10-06 redesign). A **filled white pill** is
  the one action to take; **tinted** (`bg-accent/10`) is the selected item in a
  set; a **small filled white circle** is a done mark; and identity chrome
  (wordmark, page eyebrow, active tab). `tests/accentRule.test.ts` lists every
  file allowed a solid `bg-accent`. Signal colours have one job each: `good`
  (toward your goal), `caution` (over a target, warnings), `negative` (errors,
  destructive). There is no `sage`, `gold` or terracotta any more: Tailwind 4
  compiles an unknown token's class to nothing, silently. See CLAUDE.md's
  "Frontend conventions".
- **Errors: a form submission renders its own inline error next to its
  controls; everything else toasts.** Inline is `FormError` (whole-submission)
  or `Field`'s `error` (one field). Everything else — autosaves, background
  refetches, mutations — goes to the app-wide toast in `src/lib/queryClient.ts`, which
  is also the only place a failed *query* can surface, since v5 has no
  per-query `onError`. A query whose page cannot render without it may render
  its own error state instead, and then it opts out with
  `meta: { errorToast: false }` so one failure is not reported twice.
- Dark only. There is no light token set.

## Docs

- Rsbuild: https://rsbuild.rs/llms.txt

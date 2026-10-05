# stencil

> dstack app. Global rules (router, gates, boundaries) load from
> `~/projects/dstack/core.md`. This file is the project layer: only what an
> agent cannot infer from the code. Keep it under 60 lines.

## Stack

- Node ESM (`.mjs`), no build step, no TypeScript. Tests: `node:test`.
- Chrome via Playwright (system `/usr/bin/google-chrome-stable` first), sharp for resampling.
- One `package.json` for every format (replaces seven).

## Commands

- Test: `node --test tests/`
- Build: `node stencil.mjs <format> [<name>...] [--brand <id>]` (formats: banner, thumb, social, deck, background)
- Parity: `node parity/run.mjs <format>` (fork vs Stencil on every real input; report in `.parity/report.md`)
- Moves: `node scripts/verify-moves.mjs` (every verbatim-moved file equals its fork source)
- Gates: `d-gate` (commands in `.d/gates`)

## Context map

- Map: `.d/MAP.md` — read only the area you need; `d-map` says if it is stale
- Requirements: vault note `Ekwa Organization/Reference/Tools/Stencil.md` (sole source)
- Plan: `tasks/plan.md` (one `## Task N` per lane) · Todo: `tasks/todo.md`
- Memory: `.d/decisions.tsv`, `.d/learn/` — query with `d-recall <topic>`

## Conventions

- A brand is data: `brands/<id>.mjs` exports tokens and per-format `{ layout, tokens }`.
  No brand id tests (`=== "IU"`) in format or layout code; read a token instead.
- A format owns one surface: `formats/<f>/gen.mjs` exports `main(argv)`; designs live in
  `formats/<f>/layouts/<name>/`.
- Moved code stays moved code: list it in `scripts/moves/<format>.json`; only import, asset and
  brand-lookup lines may differ from the fork.
- Output names are frozen (plan AD-3). Renaming any `.gen/`, `out/`, `canva/` or
  `preview/` path is a breaking change.

## Boundaries

- Always: run `node parity/run.mjs <format>` after touching a format, and look at
  `.parity/look/` before calling a visual change done.
- Ask first: retiring, archiving or deleting any fork; creating or pushing to a GitHub repo;
  changing an output name; adding a dependency.
- Never: write inside the seven forks or `Automation/panel-kit` (golden runs copy them to
  `$TMPDIR` first); commit content (inputs, headshots, panelists, QRs, outputs); set the git
  identity.

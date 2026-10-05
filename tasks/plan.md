# Implementation Plan: Stencil v1

## Overview

Sole source of truth: the vault design note `Ekwa Organization/Reference/Tools/Stencil.md`
(checked 2026-10-02). Background only: `.d/MAP.md` (the seven source repos as they are on
2026-10-05). Stencil folds `zoom-banner`, `iu-zoom-banner`, `podcast-thumbnails`,
`iu-podcast-thumbnails`, `panel-social-posts`, `iu-panel-social-posts` and `g-slides` into one
engine at `Automation/stencil/`: `core/` + `formats/` + `brands/` + `assets/`, one CLI
(`node stencil.mjs <format> <name> --brand <id>`), one dependency set, one GUI, and a parity
gate per format. Out of scope (needs the owner's yes): retiring or archiving any fork, creating
the GitHub repo `DakkshinEkwa/stencil`, pushing anywhere, editing the vault SOP Index or
Resource Directory.

## Assumptions (flag for correction before or during build)

- **A1** The thread arrived as the design note with no message: read as "build it now". The
  build trigger in the note is already met, since `iu-zoom-banner` is the fifth-plus repo.
- **A2** OBA stays a first-class pack although OBA retired on 2026-09-28: the note asks for the
  OBA pilot and IU reuses the OBA machinery. VET is a legacy pack.
- **A3** Where a fork is a whole redesign rather than values (IU thumbnail v3, IU social scene
  graph), it becomes a named layout inside its format and the pack names its layout. This is
  the note's "frame types"; the note's "values plus shared fixes" framing predates the v3 work.
- **A4** The human look gates fork retirement, not the next build phase. Side-by-sides are
  written for every case and presented at the end (never-block-on-human).
- **A5** Parity covers every real input in the forks, stronger than the note's default of one
  input per format. Strictness is defined in AD-5.
- **A6** Inputs live at the workspace root under their legacy folder names (`panels/`,
  `episodes/`, `posts/`, `decks/`, `speakers/`); every imported input gets an explicit
  `brand`. New files default to IU, the active brand.
- **A7** Content is copied from the forks, never moved; every fork keeps working unchanged.
- **A8** Deck-only geometry, draw primitives and slide registry stay in `formats/deck/` until a
  second surface needs them (rule of two). `core/` holds what two or more formats share.
- **A9** `g-slides/host-background` comes along as a fifth small format, `background`, so
  `g-slides` can retire whole.
- **A10** The GUI reuses panel-kit unchanged: a root `gen.mjs` shim reads `STENCIL_FORMAT`,
  which `node gui.mjs <format>` sets before `launch()`.
- **A11** The note's tree has no input folders and no parity tooling; `parity/` and `scripts/`
  are added for that.
- **A12** The OBA thumbnail template loads Inter and IBM Plex Mono from Google Fonts over the
  network. Kept as-is for parity, flagged as a follow-up (local fonts would change output).

## Architecture decisions

- **AD-1 Engine, format, layout, pack.** `core/` is shared infrastructure (TOML, paths,
  assets, brands, Chromium, SVG helpers, text metrics, output contract, CLI dispatch).
  `formats/<f>/` owns one surface: its CLI (`gen.mjs` with `main(argv)`), its normalize
  skeleton, its output names, its GUI schema and its layouts. `formats/<f>/layouts/<l>/` is
  one design's renderer. `brands/<id>.mjs` is data only: tokens, logos, font set, and per
  format `{ layout, tokens }`.
- **AD-2 Token resolution.** `resolveBrand(id, format)` returns
  `{ ...pack.tokens, ...pack.formats[format].tokens }`; a layout's own defaults sit under that.
  Every override carries a comment saying why it exists. A layout that hands a legacy brand
  object to moved code declares `BRAND_KEYS` (legacy order) and receives
  `pick(resolved, BRAND_KEYS)`, so the object its code and `.gen/` see is the fork's object.
- **AD-3 Output contract, frozen per format, relative to the workspace root** (`STENCIL_WORKSPACE`,
  else `PANEL_WORKSPACE`, else the stencil root):
  banner `out/<stem>.png`, `out/<stem>@3x.png`, `canva/<stem>.svg`;
  thumb `canva/<PREFIX>-<name>.svg` (OBA or IU), `preview/<name>.png`;
  social `canva/<name>-<fmt>.svg`, `out/<name>-<fmt>@2x.png`, campaign nesting
  `out/<campaign>/<person>/<fmt>/` as in `panel-social-posts/gen.mjs:253-262`;
  deck `canva/<deck>/NN-<type>.svg`, `out/<deck>/NN-<type>@2x.png`, `out/<deck>.pdf`;
  background `canva/host-background.svg`, `out/host-background.png`, `out/host-background.jpg`;
  every format `.gen/<name>.json`. One name used by two formats is refused, because `.gen/`
  is shared. Changing any of these is a breaking change and out of scope.
- **AD-4 Lift and shift.** A moved file keeps its code. Allowed edits: import paths, asset,
  font and template paths, brand lookups through `core/brands.mjs`, playwright and sharp
  resolution through `core/chromium.mjs`. Every moved file is listed in `scripts/moves/<format>.json`
  as `verbatim` (must equal the source after the declared rewrites, checked by
  `node scripts/verify-moves.mjs`) or `adapted` (provenance only). Verbatim moves do not count
  toward the 5-file authored scope; the verifier is their review.
- **AD-5 Parity gate.** `node parity/run.mjs <format>` renders every case through the fork in a
  scratch copy (golden) and through Stencil, then compares. Pass means: `.gen` deep-equal after
  mapping asset paths and file URIs to basenames, with `brand` compared on the fork's keys;
  SVG text equal after the same path mapping; PNG pixel-identical for raw Chrome captures and
  mean absolute error at most 0.002 for resampled files (`compare -metric MAE`); PDF same page
  count and the same embedded font families. Output: `.parity/report.md` plus
  `.parity/look/<format>/<case>.png` (golden, Stencil, diff side by side). Exit 0 only if all pass.
- **AD-6 One dependency set.** `package.json` declares express, multer, smol-toml,
  toml-eslint-parser, playwright, sharp. Chrome is the system `/usr/bin/google-chrome-stable`
  (channel `chrome` first). Nothing resolves from `../../OBA/oba-website`.
- **AD-7 Sources are read-only.** Never edit, commit, reset or write output inside the seven
  forks or `Automation/panel-kit`. Golden runs copy a fork into `$TMPDIR/stencil-parity/` first.
- **AD-8 Content stays local.** Inputs, headshots, panelists, QRs and all outputs are gitignored.
  Committed: code, tests, `_template*.toml`, fonts, logos, brand packs, docs.
- **AD-9 Format CLIs keep their fork's flags** and panel-kit's `--list --json` and
  `--emit-json` contract (`panel-kit/docs/CONTRACT.md` §2), reached as
  `node stencil.mjs <format> ...`. `--brand <id>` beats the file's `brand`, which beats the
  format default (IU).

## Dependency graph

```text
T1 scaffold ─┬─ T2 toml ─────────────┐
             ├─ T3 paths+assets ─────┤
             ├─ T4 chromium+svg ─────┼─ T8 contract+CLI ─┬─ T9 parity harness ─┐
             ├─ T5 brands core ─ T6 packs ──────────────┤                      │
             └─ T7 import ───────────────────────────────┴─ T10 moves verifier ┤
                                                                               ▼
                         CP0 ─ T11 banner skeleton ─ T12 banner unified ─ T13 banner tokens+parity ─ CP1
CP1 ─┬─ T14 thumb OBA ─┬─ T16 thumb gen+parity ─────────────┐
     ├─ T15 thumb IU ──┘                                    │
     ├─ T17 social shared ─┬─ T18 social OBA ─┬─ T20 social parity ─┼─ CP2
     │                     └─ T19 social IU ──┘                     │
     └─ T21 deck ─ T22 background ─ T23 deck+background parity ─────┘
CP2 ─ T24 brand packs finish ─┬─ T25 GUI ─┬─ T26 docs ─ CP3
                              └───────────┘
```

## Task list

### Phase 0 — Foundations

## Task 1: Scaffold the repository and the one dependency set

**Description:** Create `Automation/stencil/` as its own git repo (no parent repo, no
`user.name`/`user.email` set: `includeIf` supplies the work identity). One `package.json`
(AD-6), a `.gitignore` for content and outputs (AD-8), the dstack layer via `d-init`, and the
directory skeleton with `.gitkeep` files: `core/ formats/ brands/ assets/{fonts,logos,headshots,panelists,qrs}/
panels/ episodes/ posts/ decks/ speakers/ parity/ scripts/ tests/`.
**Acceptance criteria:**
- [ ] `git -C stencil rev-parse` works and `git config user.email` inside it is the work identity
- [ ] `npm install` succeeds; `node -e "import('playwright').then(()=>import('sharp'))"` resolves locally
- [ ] Ignored: `assets/headshots/x.jpg`, `assets/panelists/x.toml`, `assets/qrs/x.png`, `.gen/a.json`,
      `out/a.png`, `canva/a.svg`, `preview/a.png`, `episodes/ep1.toml`, `.parity/x`; not ignored:
      `episodes/_template.toml`, `assets/fonts/x.woff2`, `assets/logos/x.png`
- [ ] `AGENTS.md`, `CLAUDE.md`, `.d/decisions.tsv` exist (from `d-init`)
**Verification:**
- [ ] `npm ls --depth=0`
- [ ] `git check-ignore -v <each path above>`
**Dependencies:** None
**Files likely touched:** `package.json`, `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`
**Pattern to follow:** `g-slides/.gitignore` (content stays local), `panel-social-posts/package.json`
**Seat:** builder
**Estimated scope:** S

## Task 2: One TOML parser

**Description:** `core/toml.mjs` is the `panel-social-posts/lib/toml.mjs` copy (the superset:
it accepts plain `[event]` tables, which the thumbnail copy rejects). The four identical copies
and the three drifted ones collapse to this one.
**Acceptance criteria:**
- [ ] `core/toml.mjs` exports `parseToml` with the same behaviour as `panel-social-posts/lib/toml.mjs`
- [ ] Test: every `*.toml` under `tests/fixtures/toml/` (copied samples: one banner panel, one
      OBA and one IU episode, one OBA and one IU post, one panelist, one deck) parses without error
- [ ] Test: a plain `[event]` table parses (was an error in the thumbnail copy); errors keep line numbers
**Verification:**
- [ ] `node --test tests/toml.test.mjs`
**Dependencies:** T1
**Files likely touched:** `core/toml.mjs`, `tests/toml.test.mjs`, `tests/fixtures/toml/*`
**Pattern to follow:** `panel-social-posts/lib/toml.mjs:200-220` (plain table branch)
**Seat:** builder
**Estimated scope:** S

## Task 3: Paths, workspace and the single asset pool

**Description:** `core/paths.mjs` resolves ROOT, WORKSPACE (AD-3 order), the pool folders
`assets/{fonts,logos,headshots,panelists,qrs}`, the input folders, and the output folders under
WORKSPACE. `core/assets.mjs` resolves asset references with one rule for every format: data URI,
then absolute path, then the workspace pool, then the stencil pool, then workspace-relative.
Ports `photoStem`, the stem index and `resolveSpeakerPhoto` from g-slides. No path may leave
the stencil root or the workspace.
**Acceptance criteria:**
- [ ] `resolveAsset(ref, "headshots"|"qrs"|"logos"|"panelists")` follows the order above; missing returns `""`
- [ ] `photoStem("Chris Bonsall_OBA_17.09.2026.jpeg") === "chris-bonsall"`; cutout files are skipped by the index
- [ ] `STENCIL_WORKSPACE=/tmp/x` moves inputs and outputs, not fonts or logos
- [ ] Test greps `core/` for `"..", "` sibling reaches and finds none
**Verification:**
- [ ] `node --test tests/assets.test.mjs`
**Dependencies:** T1
**Files likely touched:** `core/paths.mjs`, `core/assets.mjs`, `tests/assets.test.mjs`
**Pattern to follow:** `g-slides/lib/paths.mjs:95-189`
**Seat:** builder
**Estimated scope:** S

## Task 4: Chromium loader and SVG helpers

**Description:** `core/chromium.mjs` loads playwright and sharp from stencil's own
`node_modules` only and launches Chrome (channel `chrome`, then `/usr/bin/google-chrome-stable`,
then the bundle; `--no-sandbox`). `core/svg.mjs` holds `escXml`, `fontFaceCss(faces, dir)`
(base64 woff2 `@font-face`), and `fileDataUri(path)` with the MIME taken from the extension.
**Acceptance criteria:**
- [ ] `loadChromium()`, `loadSharp()`, `launch()` exported; no `oba-website` string in `core/`
- [ ] `fileDataUri` returns `image/svg+xml` for `.svg`, `image/png` for `.png`, `image/jpeg` for `.jpg/.jpeg`
- [ ] `escXml` escapes `& < > " '`
**Verification:**
- [ ] `node --test tests/svg.test.mjs`
- [ ] `node -e "import('./core/chromium.mjs').then(async m=>{const b=await m.launch();await b.close();console.log('ok')})"`
**Dependencies:** T1
**Files likely touched:** `core/chromium.mjs`, `core/svg.mjs`, `tests/svg.test.mjs`
**Pattern to follow:** `g-slides/lib/chromium.mjs:20-48`, `iu-panel-social-posts/brands.mjs:120-127` (MIME data URI)
**Seat:** builder
**Estimated scope:** S

## Task 5: Brand registry and the OBA and IU packs

**Description:** `core/brands.mjs` loads `brands/*.mjs`, lists ids, and implements AD-2
(`resolveBrand(id, format)`, `pick(obj, keys)`), plus `logoDataUri(id, format)` and
`logoFile(id, format)` reading `assets/logos/`. `brands/oba.mjs` and `brands/iu.mjs` hold the
union of each brand's token keys across the forks (values agree on shared keys; checked in the
tour), with format overrides where a value differs per surface (banner `logoH`).
Snapshot the legacy registries into `tests/fixtures/legacy-brands.json` (read-only copy, so
tests never reach into a fork).
**Acceptance criteria:**
- [ ] For OBA (panel-kit and social registries) and IU (iu-banner and iu-social registries):
      `pick(resolveBrand(id, f), Object.keys(legacy))` deep-equals the legacy object
- [ ] Every override in a pack has a one-line comment giving its reason
- [ ] Unknown id throws with the list of known ids
**Verification:**
- [ ] `node --test tests/brands.test.mjs`
**Dependencies:** T1, T3
**Files likely touched:** `core/brands.mjs`, `brands/oba.mjs`, `brands/iu.mjs`, `tests/brands.test.mjs`, `tests/fixtures/legacy-brands.json`
**Pattern to follow:** `iu-zoom-banner/panel-kit/lib/brands.mjs:19-108`, `panel-social-posts/brands.mjs:18-134`
**Seat:** builder
**Estimated scope:** M

## Task 6: OBA_LIGHT, IU_LIGHT and VET packs

**Description:** The three remaining packs: `brands/oba-light.mjs` (social only today),
`brands/iu-light.mjs` (banner, social, thumb light mode), `brands/vet.mjs` (legacy: banner and
social). Each pack lists only the formats it has a real design for.
**Acceptance criteria:**
- [ ] Legacy deep-equal (T5 rule) holds for OBA_LIGHT, IU_LIGHT (both registries) and VET (both registries)
- [ ] `vet.mjs` and `oba.mjs` carry `status: "legacy"` with the retirement date in a comment
**Verification:**
- [ ] `node --test tests/brands.test.mjs`
**Dependencies:** T5
**Files likely touched:** `brands/oba-light.mjs`, `brands/iu-light.mjs`, `brands/vet.mjs`, `tests/brands.test.mjs`
**Pattern to follow:** `brands/iu.mjs` (from T5)
**Seat:** builder
**Estimated scope:** S

## Task 7: Content and asset import script

**Description:** `scripts/import.mjs` copies, never moves (A7): both font sets into
`assets/fonts/` (OBA `*-normal.woff2`, IU `Inter-*`, `InterDisplay-*`, `EBGaramond-*`), logos and
stamps into `assets/logos/`, headshots, panelists and QRs into the pools, and inputs into the
input folders, adding an explicit `brand = "<ID>"` line where a file has none (OBA thumb
episodes, OBA posts and panels without one, IU files without one). `_template.toml` per brand:
the IU one keeps the name, others become `_template-oba.toml`. Idempotent; a same-name
different-bytes conflict stops with a report; `--dry-run` prints the plan.
**Acceptance criteria:**
- [ ] Second run reports 0 copies and 0 edits
- [ ] No file in any fork changes (mtime and hash check in the script's own summary)
- [ ] Every imported input parses with `core/toml.mjs` and has a `brand`
**Verification:**
- [ ] `node scripts/import.mjs --dry-run && node scripts/import.mjs && node scripts/import.mjs`
**Dependencies:** T2, T3
**Files likely touched:** `scripts/import.mjs`
**Pattern to follow:** `g-slides/lib/paths.mjs:136-170` (stem index, the shape of a pool scan)
**Seat:** builder
**Estimated scope:** M

## Task 8: Output contract, format registry and the CLI

**Description:** `core/contract.mjs` holds AD-3 as pure functions per format plus the
cross-format name guard. `formats/index.mjs` registers banner, thumb, social, deck and
background (unported ones as stubs). `stencil.mjs` dispatches `node stencil.mjs <format> ...`
to `formats/<format>/gen.mjs` `main(argv)`; `--help` lists formats and brand ids.
**Acceptance criteria:**
- [ ] `tests/contract.test.mjs` asserts every AD-3 path for a sample name per format
- [ ] Name guard: an input name present in two formats' input folders is refused with both paths
- [ ] `node stencil.mjs --help` exits 0 and lists 5 formats and 5 brands; an unknown format exits 2
**Verification:**
- [ ] `node --test tests/contract.test.mjs && node stencil.mjs --help`
**Dependencies:** T2, T3, T4, T5
**Files likely touched:** `core/contract.mjs`, `formats/index.mjs`, `stencil.mjs`, `tests/contract.test.mjs`
**Pattern to follow:** `g-slides/gen.mjs:552-566` (listOutputs, the shape of an output list)
**Seat:** builder
**Estimated scope:** M

## Task 9: Parity harness

**Description:** `parity/golden.mjs <format>` copies the fork(s) for that format plus the
siblings they reach (`podcast-thumbnails/headshots`, `iu-podcast-thumbnails/headshots`) into
`$TMPDIR/stencil-parity/Automation/`, symlinks each fork's `node_modules` and
`$TMPDIR/stencil-parity/OBA` to the real `OBA` folder, runs the fork's own CLI per case, and
collects outputs into `.parity/golden/<format>/`. `parity/compare.mjs` implements AD-5.
`parity/run.mjs <format>` runs Stencil for the same cases, compares, and writes the report and
side-by-sides. Cases come from `parity/cases/<format>.mjs` (one file per format, so format
lanes never share a file).
**Acceptance criteria:**
- [ ] Golden refuses to write anywhere under `Automation/` except `stencil/.parity/`
- [ ] `node parity/golden.mjs banner` writes golden `.gen`, SVG and PNGs for all 5 banner inputs
- [ ] A deliberately changed Stencil output (one colour) fails compare with that case named
**Verification:**
- [ ] `node parity/golden.mjs banner && ls .parity/golden/banner`
- [ ] `git -C ../zoom-banner status --short` unchanged before and after
**Dependencies:** T7, T8
**Files likely touched:** `parity/golden.mjs`, `parity/compare.mjs`, `parity/run.mjs`, `parity/cases/banner.mjs`
**Pattern to follow:** `iu-podcast-thumbnails/scripts/fidelity.mjs` (render both sides, MAE)
**Seat:** builder
**Estimated scope:** M

## Task 10: Moves manifest and verifier

**Description:** `scripts/moves/<area>.json` lists `{ src, dest, mode: "verbatim"|"adapted", rewrites: [[from, to]] }`.
`scripts/verify-moves.mjs` applies each verbatim entry's rewrites to the source and requires the
result to equal the destination byte for byte, printing a unified diff on failure (AD-4).
**Acceptance criteria:**
- [ ] Exit 0 on an empty manifest and on a correct entry; exit 1 with a diff on a wrong one
- [ ] `tests/moves.test.mjs` runs the verifier, so `node --test tests/` covers it
**Verification:**
- [ ] `node scripts/verify-moves.mjs && node --test tests/moves.test.mjs`
**Dependencies:** T1
**Files likely touched:** `scripts/moves/*.json`, `scripts/verify-moves.mjs`, `tests/moves.test.mjs`
**Pattern to follow:** none in the forks; keep it under 80 lines
**Seat:** builder
**Estimated scope:** S

### Phase 1 — Pilot: the banner

## Task 11: Banner format skeleton

**Description:** `formats/banner/`: `gen.mjs` merges the two forks' CLIs (identical but for the
brand default and IU's required `ce`, now pack data `formats.banner.requireCe`), `geometry.mjs`
(verbatim, identical in both forks), `render-png.mjs` (from `render.mjs`, Chromium via core),
`render-figma-svg.mjs` (verbatim plus paths), `schema.mjs` (brand options from the registry).
Until T12 lands, `gen.mjs` routes OBA and VET to the OBA template and IU ids to the IU template
as two temporary layouts, so parity can be measured from day one.
**Acceptance criteria:**
- [ ] `node stencil.mjs banner referral-growth-panel` writes AD-3 banner outputs
- [ ] `--count`, `--svg-only`, `--list`, `--list --json`, `--emit-json`, `--watch` behave as in `zoom-banner/gen.mjs:1-16`
- [ ] An IU panel without `ce` fails with the fork's message (`iu-zoom-banner/gen.mjs:105-110`)
**Verification:**
- [ ] `node parity/run.mjs banner` (all 5 cases pass with the two temporary layouts)
**Dependencies:** CP0
**Files likely touched:** `formats/banner/gen.mjs`, `formats/banner/geometry.mjs`, `formats/banner/render-png.mjs`, `formats/banner/render-figma-svg.mjs`, `formats/banner/schema.mjs`
**Pattern to follow:** `zoom-banner/gen.mjs:89-155` (normalizeResult), `zoom-banner/render.mjs:73-133`
**Seat:** builder
**Estimated scope:** M

## Task 12: Make both banner designs brand-neutral (done as the fallback, decided up front)

**Description:** Planned as one merged template and twin. Reading the two forks showed each
fork's PNG and SVG already drift apart (IU glow 0.34 in the PNG vs 0.30 in the SVG; the OBA
SVG ignores brand text colours), so a byte-parity merge would have to encode those quirks as
fake brand values. Instead both designs become brand-neutral and are named for their design:
`strip-centre` (OBA: top-centre lobe, dots) and `strip-corner` (IU: corner lobes, arcs, PACE,
CE stamp). Every brand id test (`includes("LIGHT")`, `startsWith("IU")`) is replaced by a
token in `formats.banner.tokens.strip` (tone, lobes, pace, title accent, role text, logo
layer). Recorded in `.d/decisions.tsv`.
**Acceptance criteria:**
- [x] No brand id test left in either design (`tests/banner.test.mjs` greps for them)
- [x] Parity still exact for the 3 OBA panels and both IU panels (20/20 files)
**Verification:**
- [x] `node parity/run.mjs banner && node --test tests/banner.test.mjs`
**Dependencies:** T11
**Files likely touched:** `formats/banner/layouts/strip-centre/*`, `formats/banner/layouts/strip-corner/*`, `brands/oba.mjs`, `brands/iu.mjs`, `brands/iu-light.mjs`
**Pattern to follow:** `formats/banner/layouts/strip-corner/template.html` (`__setBrand` reading `b.strip`)
**Seat:** builder
**Estimated scope:** M

## Task 13: Banner tokens for the light and legacy packs, and the banner gate

**Description:** Add banner tokens to `brands/iu-light.mjs` and `brands/vet.mjs`, port the banner
CLI test, and close the pilot: all 5 real panels pass parity, and a VET banner renders without
error. No VET input exists in any fork, and the OBA fork's VET SVG drifted from its own PNG, so
VET gets a render test, not a parity case.
**Acceptance criteria:**
- [x] Parity passes for all 5 banner cases
- [x] A VET banner renders through `strip-centre` (`tests/banner.test.mjs`)
- [x] `tests/banner.test.mjs` ports `zoom-banner/tests/cli-json.test.mjs` (tool name now `banner`)
**Verification:**
- [ ] `node parity/run.mjs banner && node --test tests/banner.test.mjs`
**Dependencies:** T12
**Files likely touched:** `brands/iu-light.mjs`, `brands/vet.mjs`, `parity/cases/banner.mjs`, `tests/banner.test.mjs`
**Pattern to follow:** `zoom-banner/tests/cli-json.test.mjs`
**Seat:** builder
**Estimated scope:** S

### Phase 2 — Formats

## Task 14: Thumbnail, OBA layout

**Description:** Move the OBA thumbnail renderer into `formats/thumb/layouts/classic/`:
`template.html` (from `oba-thumbnail-template.html`; keeps its Google Fonts link, A12),
`render-svg.mjs` (fonts from `assets/fonts/`, logo from `assets/logos/`), and `normalize.mjs`
(from `podcast-thumbnails/gen.mjs:103-195`). Record every move in `scripts/moves/thumb.json`.
**Acceptance criteria:**
- [ ] `node scripts/verify-moves.mjs` passes for the verbatim entries
- [ ] The layout exports `normalize(cfg, name, opts)`, `buildSvg(cfg)`, and a PNG hook used by the thumb `gen.mjs`
**Verification:**
- [ ] `node scripts/verify-moves.mjs`
**Dependencies:** CP1
**Files likely touched:** `formats/thumb/layouts/classic/template.html`, `formats/thumb/layouts/classic/render-svg.mjs`, `formats/thumb/layouts/classic/normalize.mjs`, `scripts/moves/thumb.json`
**Pattern to follow:** `podcast-thumbnails/render-svg.mjs:462-490` (buildSVG), `podcast-thumbnails/gen.mjs:125-195`
**Seat:** builder
**Estimated scope:** M

## Task 15: Thumbnail, IU layout

**Description:** Move the IU v3 renderer into `formats/thumb/layouts/cards/`: `geometry.mjs`,
`layout.mjs`, `motif.mjs`, `cutout.mjs`, `widths.json`, `template.src.html`,
`build-template.mjs` (fonts and logos from the pools; writes a gitignored `template.html`),
`render-svg.mjs`, `normalize.mjs` (from `iu-podcast-thumbnails/gen.mjs:110-270`), `fidelity.mjs`.
`brand = "IU_LIGHT"` selects `mode = "light"`; a legacy `mode` key still works. Port
`tests/geometry.test.mjs` and `tests/layout.test.mjs`.
**Acceptance criteria:**
- [ ] `node scripts/verify-moves.mjs` passes; the 20 IU thumbnail tests pass under `tests/thumb-iu-*.test.mjs`
- [ ] The template builds from the pools and the build throws on CSS drift as before
**Verification:**
- [ ] `node --test tests/thumb-iu-*.test.mjs && node scripts/verify-moves.mjs`
**Dependencies:** CP1
**Files likely touched:** `formats/thumb/layouts/cards/*` (verbatim, AD-4), `formats/thumb/layouts/cards/normalize.mjs`, `formats/thumb/layouts/cards/build-template.mjs`, `scripts/moves/thumb.json`, `tests/thumb-iu-layout.test.mjs`
**Pattern to follow:** `iu-podcast-thumbnails/scripts/build-template.mjs:20-40`, `iu-podcast-thumbnails/.d/MAP.md`
**Seat:** builder
**Estimated scope:** M

## Task 16: Thumbnail CLI and gate

**Description:** `formats/thumb/gen.mjs` merges both forks' CLIs (`--speakers`, `--svg-only`,
`--list`, `--list --json`, `--emit-json`, `--watch`), routes by the resolved brand's
`formats.thumb.layout`, and writes AD-3 names (`canva/OBA-<name>.svg` or `canva/IU-<name>.svg`,
`preview/<name>.png`). `render-png.mjs` screenshots the layout's template. Parity over every
real episode (79 OBA, 4 IU).
**Acceptance criteria:**
- [ ] `node parity/run.mjs thumb` passes for every case
- [ ] `tests/thumb.test.mjs` ports both forks' `cli-json` tests
**Verification:**
- [ ] `node parity/run.mjs thumb && node --test tests/thumb.test.mjs`
**Dependencies:** T14, T15
**Files likely touched:** `formats/thumb/gen.mjs`, `formats/thumb/render-png.mjs`, `formats/thumb/schema.mjs`, `parity/cases/thumb.mjs`, `tests/thumb.test.mjs`
**Pattern to follow:** `podcast-thumbnails/gen.mjs:210-330`, `iu-podcast-thumbnails/render.mjs:80-96`
**Seat:** builder
**Estimated scope:** M

## Task 17: Social, shared engine pieces

**Description:** `formats/social/`: `gen.mjs` merged from both forks (85% shared: post and
panelist normalize, campaign nesting, `--formats`, `--brand`), `cutout.mjs` and
`portrait-fit.mjs` (the IU copies, which carry the fixes; diff triaged in `.d/decisions.tsv`),
`qr.mjs` (IU's QR selection, which is brand-neutral: "Brand does not change the variant"),
`schema.mjs`.
**Acceptance criteria:**
- [ ] `--emit-json` for one OBA post and one IU post matches the golden `.gen` (AD-5 rule)
- [ ] Every line of the OBA vs IU diff in `cutout.mjs`, `portrait-fit.mjs`, `geometry.mjs` is
      triaged as shared fix or brand value in `.d/decisions.tsv`
**Verification:**
- [ ] `node parity/run.mjs social --gen-only`
**Dependencies:** CP1
**Files likely touched:** `formats/social/gen.mjs`, `formats/social/cutout.mjs`, `formats/social/portrait-fit.mjs`, `formats/social/qr.mjs`, `formats/social/schema.mjs`
**Pattern to follow:** `iu-panel-social-posts/gen.mjs:171-310`, `iu-panel-social-posts/lib/qr.mjs`
**Seat:** builder
**Estimated scope:** M

## Task 18: Social, OBA layout

**Description:** Move `template.html`, `speaker-template.html`, `render-svg.mjs` and the template
half of `render.mjs` (speaker bounding boxes, `__setBrand`, `__setFormat`) into
`formats/social/layouts/classic/`, with font and logo URLs pointed at the pools.
**Acceptance criteria:**
- [ ] Parity passes for every OBA post and format
- [ ] `node scripts/verify-moves.mjs` passes
**Verification:**
- [ ] `node parity/run.mjs social --brand OBA`
**Dependencies:** T17
**Files likely touched:** `formats/social/layouts/classic/template.html`, `formats/social/layouts/classic/speaker-template.html`, `formats/social/layouts/classic/render-svg.mjs`, `formats/social/layouts/classic/render-png.mjs`, `scripts/moves/social.json`
**Pattern to follow:** `panel-social-posts/render.mjs:184-236`
**Seat:** builder
**Estimated scope:** M

## Task 19: Social, IU layout

**Description:** Move `iu-panel-social-posts/lib/iu/**` into `formats/social/layouts/scene/` and its
`render-svg.mjs` and `render.mjs` (Chrome rasterises the scene SVG). Fonts, logos, stamps and
PACE mark from the pools. Port `tests/qr.test.mjs` and `tests/promo-pack.test.mjs`.
**Acceptance criteria:**
- [ ] Parity passes for every IU post and format
- [ ] Every event card keeps its PACE plate and CE seal (the layout's own accreditation check stays on)
- [ ] The 14 IU social tests pass under `tests/social-iu-*.test.mjs`
**Verification:**
- [ ] `node parity/run.mjs social --brand IU && node --test tests/social-iu-*.test.mjs`
**Dependencies:** T17
**Files likely touched:** `formats/social/layouts/scene/**` (verbatim, AD-4), `formats/social/layouts/scene/render-png.mjs`, `scripts/moves/social.json`, `tests/social-iu-qr.test.mjs`, `tests/social-iu-promo.test.mjs`
**Pattern to follow:** `iu-panel-social-posts/render.mjs`, `iu-panel-social-posts/lib/iu/layouts/index.mjs:19-30`
**Seat:** builder
**Estimated scope:** M

## Task 20: Social gate

**Description:** Parity over every real post in both forks, every format each post requests,
including campaign nesting. Port `panel-social-posts/tests/cli-json.test.mjs`.
**Acceptance criteria:**
- [ ] `node parity/run.mjs social` passes for every case (31 OBA posts, 22 IU posts)
**Verification:**
- [ ] `node parity/run.mjs social && node --test tests/social.test.mjs`
**Dependencies:** T18, T19
**Files likely touched:** `parity/cases/social.mjs`, `tests/social.test.mjs`
**Pattern to follow:** `panel-social-posts/tests/cli-json.test.mjs`
**Seat:** builder
**Estimated scope:** S

## Task 21: Deck

**Description:** Move g-slides into `formats/deck/`: `gen.mjs`, `render-svg.mjs`, `render.mjs`
(PNG and PDF), `shell.html`, and `lib/{geometry,draw,slides,images}.mjs` (A8). `lib/text.mjs` and
`lib/metrics.mjs` become `core/text.mjs` and `core/metrics.mjs`. Paths through `core/paths.mjs`;
speakers resolve local `speakers/` then `assets/panelists/`; photos through `core/assets.mjs`.
**Acceptance criteria:**
- [ ] `node stencil.mjs deck sep17-referral-growth` writes AD-3 deck outputs and the PDF
- [ ] `--svg-only`, `--slides`, `--no-pdf`, `--watch`, `--list`, `--emit-json` behave as in `g-slides/gen.mjs:1-20`
- [ ] The 66 g-slides tests pass under `tests/deck-*.test.mjs`
**Verification:**
- [ ] `node --test tests/deck-*.test.mjs && node scripts/verify-moves.mjs`
**Dependencies:** CP1
**Files likely touched:** `formats/deck/*` (verbatim, AD-4), `core/text.mjs`, `core/metrics.mjs`, `scripts/moves/deck.json`, `tests/deck-text.test.mjs`
**Pattern to follow:** `g-slides/render.mjs:55-120`, `g-slides/lib/paths.mjs`
**Seat:** builder
**Estimated scope:** M

## Task 22: Background format

**Description:** Move `g-slides/host-background/` into `formats/background/` (A9), reusing the
deck's draw primitives and core Chromium. CLI `node stencil.mjs background [--svg-only]`.
**Acceptance criteria:**
- [ ] Writes `canva/host-background.svg`, `out/host-background.png`, `out/host-background.jpg`
**Verification:**
- [ ] `node stencil.mjs background && identify out/host-background.png`
**Dependencies:** T21
**Files likely touched:** `formats/background/gen.mjs`, `formats/background/geometry.mjs`, `formats/background/render-svg.mjs`, `formats/background/render.mjs`, `scripts/moves/deck.json`
**Pattern to follow:** `g-slides/host-background/gen.mjs`
**Seat:** builder
**Estimated scope:** S

## Task 23: Deck and background gate

**Description:** Parity for the Sept 17 Referral Growth deck (the note's reference input),
`sep24-dry-eye-growth`, `edge-cases`, and the host background.
**Acceptance criteria:**
- [ ] `node parity/run.mjs deck background` passes: every slide PNG and SVG, PDF page count and embedded fonts
**Verification:**
- [ ] `node parity/run.mjs deck background`
**Dependencies:** T21, T22
**Files likely touched:** `parity/cases/deck.mjs`, `parity/cases/background.mjs`
**Pattern to follow:** `parity/cases/banner.mjs`
**Seat:** builder
**Estimated scope:** S

### Phase 3 — Packs and surface

## Task 24: Finish the brand packs

**Description:** Move the deck's dots opacity into `brands/oba.mjs` as the documented deck-scoped
token `formats.deck.tokens.dots` (the reason from `g-slides/SPEC.md` "The dots grid" quoted in
the comment), add `formats.deck` to the IU packs so `node stencil.mjs deck <deck> --brand IU`
renders without error (no golden: human look), and confirm VET still renders banner and social.
**Acceptance criteria:**
- [ ] Deck parity still passes after the token move
- [ ] An IU deck renders all slides; its PNGs go in `.parity/look/deck-iu/` for the human look
**Verification:**
- [ ] `node parity/run.mjs deck && node stencil.mjs deck sep17-referral-growth --brand IU`
**Dependencies:** CP2
**Files likely touched:** `brands/oba.mjs`, `brands/iu.mjs`, `brands/iu-light.mjs`, `formats/deck/lib/draw.mjs`, `formats/deck/lib/geometry.mjs`
**Pattern to follow:** `g-slides/lib/draw.mjs:160-232` (dots layer)
**Seat:** builder
**Estimated scope:** S

## Task 25: One GUI for every surface

**Description:** Vendor panel-kit unchanged into `panel-kit/` (its `scripts/vendor.mjs` output).
Root `gen.mjs` is a shim that runs `formats/$STENCIL_FORMAT/gen.mjs` (A10). `gui.mjs <format>`
sets `STENCIL_FORMAT` and launches panel-kit with that format's schema, whose `assetDirs` point
at `assets/*`. `gui.mjs` with no argument lists the formats.
**Acceptance criteria:**
- [ ] `STENCIL_FORMAT=banner node gen.mjs --list --json` returns the CONTRACT §2 shape
- [ ] `NO_OPEN=1 node gui.mjs banner` serves `/api/schema` for every format (smoke test)
**Verification:**
- [ ] `node --test tests/gui.test.mjs`
**Dependencies:** T24
**Files likely touched:** `gen.mjs`, `gui.mjs`, `tests/gui.test.mjs`, `panel-kit/**` (vendored, generated)
**Pattern to follow:** `zoom-banner/gui.mjs`, `panel-kit/lib/runner.mjs:17-60`
**Seat:** builder
**Estimated scope:** S

## Task 26: Docs and the map

**Description:** `README.md` (what it is, commands per format, how to add a brand in one file,
the parity gate), `AGENTS.md` (commands, gates, boundaries incl. AD-7 and AD-8), rewrite
`.d/MAP.md` to describe Stencil itself and stamp it, and one `.d/decisions.tsv` row per
load-bearing decision.
**Acceptance criteria:**
- [ ] Every command in README and AGENTS runs as written
- [ ] MAP ≤150 lines, every cited path exists
**Verification:**
- [ ] `d-map . && d-gate`
**Dependencies:** T25
**Files likely touched:** `README.md`, `AGENTS.md`, `.d/MAP.md`, `.d/decisions.tsv`
**Pattern to follow:** `g-slides/AGENTS.md`
**Seat:** builder
**Estimated scope:** S

## Open questions (carried from the note, not solved here)

1. DFY pack: deferred until a DFY surface is needed (note default).
2. VET retention: kept as a legacy pack (note default).
3. Repo boundary: local repo now; `DakkshinEkwa/stencil` and any push wait for the owner.
4. Parity strictness: AD-5 sets it; the owner may loosen or tighten it after the first report.

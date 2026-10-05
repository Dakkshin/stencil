# MAP: Stencil
<!-- d-map: sha=9301f68 date=2026-10-05 -->

> Hierarchical summary for agents. Load only the section you need. Requirements live in
> the vault note `Ekwa Organization/Reference/Tools/Stencil.md` and `tasks/plan.md`; this
> describes the code as it is. Written by `d-tour`, stamped by `d-map --stamp`.

## What it is

One engine renders five surfaces (banner, thumb, social, deck, background) for five brand
packs, replacing seven forked generator repos. Load-bearing invariant: for every real input,
Stencil's sidecar, SVG and PNG equal the fork's (`node parity/run.mjs <format>`), and output
names never change (`core/contract.mjs`).

## Commands

- Test: `node --test tests/` · Gates: `d-gate` (tests + `node scripts/verify-moves.mjs`)
- Build: `node stencil.mjs <format> [<name>...] [--brand <id>]`
- Parity: `node parity/run.mjs <format>...` then `node parity/look.mjs` (report `.parity/report.md`)
- Content: `node scripts/import.mjs` (from the forks; idempotent) · GUI: `node gui.mjs <format>`

## Areas

### Core (`core/`)
Purpose: what two or more formats share. `paths.mjs` (ROOT, WORKSPACE, pools, outputs),
`assets.mjs` (one lookup order, photo stems), `brands.mjs` (registry), `contract.mjs` (frozen
names, name guard), `chromium.mjs`, `svg.mjs`, `toml.mjs` (the one parser).
Pattern: `core/brands.mjs:64-72` resolveBrand: pack id and label, base tokens, format override.
Invariants: no path outside the repo or workspace; core never imports a format.
Tests: `tests/assets.test.mjs`, `tests/brands.test.mjs`, `tests/contract.test.mjs`

### Brand packs (`brands/`)
Purpose: data only. `tokens` (palette, logo, wordmark) and `formats.<f>.{layout, tokens, options}`.
Invariants: id and label stated once; a layout must be listed in `formats/index.mjs`; every
override carries its reason in a comment. Tests: `tests/brands.test.mjs`

### Format registry and CLI (`formats/index.mjs`)
Purpose: the five formats and their design names; `stencil.mjs` dispatches to
`formats/<f>/gen.mjs` `main(argv)` after the cross-format name guard (`stencil.mjs:60`).

### Banner (`formats/banner/`)
Purpose: 640x200 strip. `gen.mjs` (normalize 86, LAYOUTS 45), `render-png.mjs`, designs
`layouts/strip-centre` (OBA) and `layouts/strip-corner` (IU), brand-neutral via `brand.strip`.
Tests: `tests/banner.test.mjs`

### Thumbnail (`formats/thumb/`)
Purpose: 2560x1440. `gen.mjs` (LAYOUTS 43, buildEpisode 166), `render-png.mjs` (agreedCapture),
`layouts/classic` (OBA, Google Fonts, two-session agreement) and `layouts/cards` (IU v3,
generated `template.html` from `template.src.html`). Tests: `tests/thumb*.test.mjs`

### Social (`formats/social/`)
Purpose: square/portrait/story posts. `gen.mjs` (LAYOUTS 62, normalize 220, buildPost 444),
shared `cutout.mjs`, `portrait-fit.mjs`, `qr.mjs`; `layouts/classic` (OBA HTML templates) and
`layouts/scene` (IU scene graph, Chrome rasterises the SVG). Tests: `tests/social*.test.mjs`

### Deck (`formats/deck/`)
Purpose: 1920x1080 deck, SVG first, PNG and PDF from the same strings. Verbatim g-slides except
`lib/paths.mjs` (same exports over core) and `lib/brands.mjs` (panel-kit shape from packs).
Tests: `tests/deck.test.mjs`, `tests/deck-geometry.test.mjs`, `tests/deck-text.test.mjs`

### Background (`formats/background/`)
Purpose: the fixed Zoom host background, on the deck's draw primitives. Tests: `tests/background.test.mjs`

### Parity harness (`parity/`)
Purpose: fork goldens in `$TMPDIR` scratch copies (`golden.mjs`), file verdicts (`compare.mjs:146`),
the runner with identical-failure and repeat-render rules (`run.mjs:50`), cases per format
(`parity/cases/<f>.mjs`), contact sheets (`look.mjs`).
Invariants: never writes inside a fork; caches (`CACHE_DIRS`) are carried, never compared.
Tests: `tests/parity.test.mjs`

### Moves and import (`scripts/`)
Purpose: `moves/<format>.json` records every file moved from a fork; `verify-moves.mjs` proves
verbatim ones; `apply-moves.mjs` writes them; `import.mjs` copies content with fork mtimes.
Tests: `tests/moves.test.mjs`

### GUI (`panel-kit/`)
Purpose: vendored panel-kit, unchanged. `gui.mjs <format>` sets STENCIL_FORMAT; root `gen.mjs`
forwards the kit's CLI calls. Tests: `tests/gui.test.mjs`

## Flows

```
<inputs>/<name>.toml + brands/<id>.mjs
  -> formats/<f>/gen.mjs normalize (brand from --brand, file, default IU; layout from the pack)
  -> .gen/<name>.json -> layout twin -> canva/*.svg -> Chrome -> out|preview/*.png [+ .pdf]
missing photo: monogram · missing QR: empty frame · bad input: problems listed, exit 1
parity: fork in scratch (golden) vs Stencil in scratch workspace -> .parity/report.md + look/
```

## Gotchas

- Content (inputs, photos, panelists, QRs, outputs, `.gen/cutouts`) is gitignored; `node scripts/import.mjs` restores it.
- Deleting `.gen/` drops the seeded social cutout cache; re-run the import before a social build.
- OBA thumbnail and social templates load Google Fonts: under load text can shift 1/64 px or a page load stall; the renderers retry once and the runner re-renders the fork (`.d/learn/parity.md`).
- The Sept 17 deck fails its own overflow check (slide 7) in g-slides and Stencil alike.
- Vendor panel-kit only as `node ../panel-kit/scripts/vendor.mjs stencil`; no target overwrites every fork.
- Moved social designs still key on brand ids internally (kept for parity; follow-up in decisions).
- Commit through `d-gate` with `set -o pipefail`: a piped gate hides its exit code.

## Where to look (task → files)

| If the task is about… | Start at |
|---|---|
| A new brand | `brands/iu.mjs`, `README.md` (Brands), `tests/brands.test.mjs` |
| An output name | `core/contract.mjs`, then the format's twin and `render-png.mjs` |
| A parity failure | `.parity/report.md`, `.parity/look/<format>/`, `parity/compare.mjs` |
| Photo or QR lookup | `core/assets.mjs`, `formats/social/qr.mjs` |
| A deck slide | `formats/deck/render-svg.mjs`, `formats/deck/lib/geometry.mjs` |
| The GUI | `gui.mjs`, `gen.mjs`, `formats/<f>/schema.mjs` |

## A parity failure on an image is often the fork, not Stencil (x3, 2026-10-05)

Three of the build's parity failures were Chrome nondeterminism under machine load, and the
fork does the same thing. Read the failure before touching a renderer:

- `N px differ, MAE 0.0000x` on an OBA thumbnail: the classic template's Google Fonts Inter.
  The runner re-renders the fork case up to 3 times and accepts a byte-identical fork render
  (`parity/run.mjs`, "exact against a repeat fork render" in the report); Stencil keeps the
  capture two sessions agree on (`pngAgreement` in `formats/thumb/layouts/classic/index.mjs`).
- `Chrome closed` or `page.goto: Timeout 30000ms exceeded` in a social or thumbnail render:
  one fresh browser and one retry (`chromeGone` in `formats/social/layouts/classic/render-png.mjs`,
  `transient` in `formats/thumb/render-png.mjs`).
- Thumbnail and social case files run one case at a time (`concurrency: 1`): posts that share
  an `output_name` share a sidecar, and parallel renders load the machine.

If a mismatch survives three quiet fork re-renders, it is real: open `.parity/look/<format>/`.

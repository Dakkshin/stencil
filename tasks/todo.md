# Todo: Stencil v1

Source of truth: vault note `Ekwa Organization/Reference/Tools/Stencil.md`. Detail per task:
`tasks/plan.md`. Pack a row with `d-pack T<n> --plan tasks/plan.md`. Done lives here: `[x]`.

## Phase 0: Foundations

- [x] T1: Scaffold the repository and the one dependency set (S)
- [x] T2: One TOML parser (S)
- [x] T3: Paths, workspace and the single asset pool (S)
- [x] T4: Chromium loader and SVG helpers (S)
- [x] T5: Brand registry and the OBA and IU packs (M)
- [x] T6: OBA_LIGHT, IU_LIGHT and VET packs (S)
- [x] T7: Content and asset import script (M)
- [x] T8: Output contract, format registry and the CLI (M)
- [x] T9: Parity harness (M)
- [x] T10: Moves manifest and verifier (S)
- [x] Checkpoint 0: `node --test tests/` green; `node parity/golden.mjs banner` writes golden
      outputs for all 5 panels; every fork's `git status` and file hashes unchanged. Blocks Phase 1.

## Phase 1: Pilot, the banner

- [x] T11: Banner format skeleton (M)
- [x] T12: Make both banner designs brand-neutral (M)
- [x] T13: Banner tokens for the light and legacy packs, and the banner gate (S)
- [x] Checkpoint 1: `node parity/run.mjs banner` passes on all 5 real panels (20/20 exact), VET renders;
      side-by-sides in `.parity/look/banner/`. Blocks Phase 2. (Human look gates retirement, A4.)

## Phase 2: Formats

- [ ] T14: Thumbnail, OBA layout (M)
- [ ] T15: Thumbnail, IU layout (M)
- [ ] T16: Thumbnail CLI and gate (M)
- [ ] T17: Social, shared engine pieces (M)
- [ ] T18: Social, OBA layout (M)
- [ ] T19: Social, IU layout (M)
- [ ] T20: Social gate (S)
- [x] T21: Deck (M)
- [x] T22: Background format (S)
- [x] T23: Deck and background gate (S)
- [ ] Checkpoint 2: `node parity/run.mjs thumb social deck background` passes on every real input;
      `node --test tests/` green with every fork test ported or accounted for. Blocks Phase 3.

## Phase 3: Packs and surface

- [ ] T24: Finish the brand packs (S)
- [ ] T25: One GUI for every surface (S)
- [ ] T26: Docs and the map (S)
- [ ] Checkpoint 3: `d-gate` green; full parity report; GUI smoke; side-by-sides presented to
      the owner. Retirement and the GitHub repo wait for the owner's yes.

## Standing gates (every task)

- [ ] Acceptance criteria in the plan row checked
- [ ] `d-gate` green (tests + scope ≤5 authored files + secrets; verbatim moves verified by
      `node scripts/verify-moves.mjs`, AD-4)
- [ ] Lane packets: `d-pack T<n>` budget ≤2,000 lines (else split)

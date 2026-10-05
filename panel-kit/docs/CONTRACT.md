# GUI + HTTP API Contract

Status: **v1, frozen for implementation.**
Applies to: `g-slides`, `panel-social-posts`, `podcast-thumbnails`, `zoom-banner`.

This document is the interface between three parties, all of which must agree:

| Party | Role |
|---|---|
| **Tool CLI** (`gen.mjs`, `render.mjs`, `render-svg.mjs`) | The engine. Unchanged except for two additive flags (§2). |
| **GUI server** (`<tool>/gui.mjs` + `panel-kit/lib`) | Reads/writes TOML, spawns the CLI, serves the API and the SPA. |
| **GUI web app / agents** | Consume the API (§4). One generic, schema-driven app shared by all four tools. |

Rule: **the TOML files on disk are the single source of truth.** The GUI never keeps a parallel store.
Everything in `.gen/`, `out/`, `canva/`, `preview/` is generated and regenerable.

---

## 1. The instrument, the tools, and the workspace

These tools are built for other people to run, so three things that used to share
one folder are separated:

| Layer | What it is | Where it lives | Published? |
|---|---|---|---|
| **Instrument** | Render engine, design system (brand tokens, fonts, logo), GUI + HTTP API | the `@ekwa/panel-kit` package | **yes** |
| **Tool** | One generator: its CLI, its schema, its templates | its own repo | **yes** |
| **Content** | Configs, headshots, panelist profiles, outputs | a **workspace** folder | **never** |

The instrument carries **no content** and the tool requires **no sibling folder to exist**.

### The package

`@ekwa/panel-kit`:

```
panel-kit/
  package.json          name @ekwa/panel-kit — deps: express, multer, smol-toml, toml-eslint-parser
  lib/
    index.mjs           launch() + createServer() + helpers
    toml-io.mjs         lossless read/write (§3)
    workspace.mjs       content-root resolution (below)
    brands.mjs          brand tokens + logo resolver (the design system)
    schema.mjs          schema type + validator
    paths.mjs           safe-path guard
    inventory.mjs       wraps `gen.mjs --list --json`
    runner.mjs          spawn the CLI, stream events, collect artifacts
    assets.mjs          headshots / qrs / logos list/add/remove
    server.mjs          createServer({ schema, root }) → Express app
  assets/fonts/         the shared woff2 pool
  assets/*.png          logos
  web/dist/             the prebuilt generic SPA
  scripts/vendor.mjs    copies the package into a tool (see below)
  docs/CONTRACT.md      this file
```

### How a tool consumes it

Clone a tool repo and `npm install` — nothing else. **Distribution is a git dependency**, so no
registry account is needed:

```jsonc
// <tool>/package.json
"dependencies": {
  "@ekwa/panel-kit": "github:DakkshinEkwa/panel-kit",   // or a local "file:../panel-kit" in dev
  "playwright": "^1.60.0", "sharp": "^0.34.0"
}
```

A tool provides only its own code:

```
<tool>/
  gen.mjs  render.mjs  render-svg.mjs   the CLI (unchanged for agents)
  gui.mjs                               launcher: launch({ schema, root })
  gui/schema.mjs                        the tool's field schema (§3.1)
  <template>.html                       the renderer's HTML template
```

**Vendoring (offline mode).** For a fully self-contained repo with no network at install time,
`panel-kit/scripts/vendor.mjs` copies `lib/ + assets/ + web/dist/` into `<tool>/panel-kit/` and the
tool imports it locally. The vendored copy is generated — never edit it; re-run the script after
changing the kit. In this mode the tool's own `package.json` still declares the server deps.

### The workspace (where content lives)

`lib/workspace.mjs` resolves a **content root**:

```
PANEL_WORKSPACE=/data/panels node gen.mjs <name>     # explicit
node gen.mjs <name>                                   # defaults to the tool's own folder
```

The workspace holds `headshots/`, `panelists/`, `qrs/`, `logos/`, and the tool's config + output
dirs. One workspace can serve several tools. Assets resolve **local → workspace → legacy sibling
pool**, and every fallback is skipped silently when absent, so a standalone clone still runs.
Content is gitignored by default and is never part of a published repo.


---

## 2. Additive CLI flags (the only `gen.mjs` changes)

Both are purely additive; existing invocations and output are untouched.

| Flag | Behaviour |
|---|---|
| `--list --json` | Same data as the human `--list`, printed as a single JSON document to stdout, exit 0. No other flags interact with it. |
| `--emit-json` | Run normalize + validation, write `.gen/<name>.json`, then **exit without rendering**. Used for instant preview/validation. Exit code reflects validation: `0` ok, nonzero + `problems` on stderr/stdout as today. |

`--list --json` shape (stable):

```jsonc
{
  "tool": "zoom-banner",
  "configDir": "panels",
  "items": [
    {
      "name": "referral-growth-panel",          // config stem
      "title": "Building OD Partnerships…",     // human title (tool-defined; may be null)
      "ok": true,                                // normalizes without problems
      "problems": [],                            // [{ line, message }]
      "warnings": [],
      "assets": {                                // tool-defined, resolved paths or null
        "headshots": [{ "ref": "Chris Bonsall_OBA_17.09.2026.jpeg", "resolved": true }],
        "qrs": [], "logos": []
      },
      "outputs": ["out/referral-growth-panel.png"]  // present files (may be stale)
    }
  ]
}
```

Unknown flags must continue to fail as they do today (exit 2 + help).

---

## 3. TOML read/write

### 3.1 Field schema (per tool: `gui/schema.mjs`)

A schema is a plain object. It drives both the generic form and `GET /api/schema`.

```jsonc
{
  "tool": "zoom-banner",
  "title": "Zoom Banner",
  "configDir": "panels",            // where configs live, relative to tool root
  "configLabel": "Panel",
  "assetDirs": { "headshots": "headshots", "qrs": "qrs", "logos": "logos" },
  "outDirs": { "raster": "out", "canva": "canva", "sidecar": ".gen" },
  "generate": { "flags": ["--count"], "arg": "<name>" },
  "sections": [
    {
      "id": "header", "label": "Header",
      "fields": [
        { "path": "brand", "label": "Brand", "type": "enum",
          "options": ["OBA", "VET"], "default": "OBA" },
        { "path": "title", "label": "Title", "type": "string",
          "accent": true, "help": "Prefix a word with ~ to tint it" },
        { "path": "date", "label": "Date chip", "type": "string" },
        { "path": "eyebrow", "label": "Eyebrow", "type": "string" }
      ]
    },
    {
      "id": "panelists", "label": "Panelists",
      "fields": [
        { "path": "panelists", "label": "Panelists", "type": "repeat",
          "min": 1, "max": 4, "itemLabel": "name",
          "fields": [
            { "path": "name", "label": "Name", "type": "string", "required": true },
            { "path": "role", "label": "Role", "type": "string", "maxLength": 40 },
            { "path": "photo", "label": "Photo", "type": "image" }
          ]
        }
      ]
    }
  ]
}
```

**Field types (v1, exhaustive):** `string`, `text`, `stringArray` (multi-line headline/list),
`enum`, `boolean`, `number`, `image` (asset picker over `assetDirs`), `repeat` (array of tables),
`rank` (ordered list of enum values — g-slides `order`), `url`.

Optional per-field keys: `required`, `default`, `help`, `maxLength`, `min`, `max`, `minItems`,
`maxItems`, `accent`, `options`, `fields`, `itemLabel`.

### 3.2 Read

`parseTOML(source)` → `{ data, problems: [{ line, message }] }`.

- Parser: `smol-toml` (validated at the boundary; third-party file content is untrusted input).
- `smol-toml`'s `stringify` **must never** be used to write an existing file — it drops comments.

### 3.3 Write (lossless, comment-preserving)

All form writes are **text splices against the original source**, never a re-serialization.
`toml-eslint-parser` supplies exact ranges for scalars, multi-line arrays, inline arrays and
`[[table]]` blocks.

```
setValue(source, path, value)      → string   // replace that key's value range only
setArray(source, path, values)     → string   // replace whole array value range
appendBlock(source, tableName)     → string   // append a "[[tableName]]" block at EOF
removeBlock(source, tableName, i)  → string   // delete block i + its own trailing blank line,
                                              //   never a preceding comment that isn't part of it
renameKey/setKey(source, path, v)  → string   // for keys not yet present: insert in the right table
```

Guarantees (enforced by tests):
- Every byte outside the replaced range is preserved.
- All comments survive any sequence of edits.
- The result re-parses with `smol-toml` to the expected data.
- Idempotent: writing the same value twice is a no-op diff.

Path grammar: dot-separated (`event.date`), with an integer index for `repeat`/`rank`
(`panelists.2.role`).

---

## 4. HTTP API

Base: `http://127.0.0.1:<port>`. Bound to loopback only; any other `Host` is rejected (also
blunts DNS-rebinding). State-changing requests (anything not GET/HEAD under `/api`) must send
`X-Gui-Token` equal to the per-process token returned by `GET /api/health`. The SPA reads that
token at startup; agents do the same. No CORS headers are sent (same-origin only). All responses
JSON unless noted. Errors use one shape:

```jsonc
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { } } }
```

Status codes: `400` bad request, `404` not found, `409` conflict (file changed on disk),
`422` validation failed, `500` server error (no internals leaked).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | `{ ok, tool, version }` |
| `GET` | `/api/schema` | The tool's field schema. |
| `GET` | `/api/inventory` | `--list --json` payload (§2), with `mtime` per config. |
| `GET` | `/api/configs/:name` | `{ name, toml, data, problems, warnings, mtime }` |
| `PUT` | `/api/configs/:name` | Body `{ toml }` **or** `{ ops, baseMtime }`. Returns the same shape as GET. `ops` is an ordered list applied losslessly (§3.3): `{op:"set",path,value}`, `{op:"setArray",path,values}`, `{op:"append",table,fields}`, `{op:"remove",table,index}`. `baseMtime` guards lost updates → `409`. |
| `POST` | `/api/configs/:name/validate` | Normalize only (`--emit-json`). → `{ ok, problems, warnings, genPath, config }` where `config` is the normalized sidecar with `file://` asset URLs rewritten to `/asset` (§5), ready to hand to the template. |
| `POST` | `/api/configs/:name/generate` | Body `{ flags?: string[] }` whitelisted against the schema. → `202 { runId }`. |
| `GET` | `/api/runs/:runId/events` | **SSE.** Event stream (§4.1) then closes. |
| `GET` | `/api/runs/:runId` | Final run record `{ status, exitCode, startedAt, endedAt, log, artifacts }`. |
| `GET` | `/api/artifacts/:name` | `{ files: [{ scope, path, url, stale }] }` — `stale` = older than the TOML. |
| `GET` | `/api/assets` | `{ headshots: [...], qrs: [...], logos: [...] }` (name, url). |
| `POST` | `/api/assets/:kind` | `multipart/form-data` (`file`, optional `name`). Validates kind + extension + safe filename. |
| `DELETE` | `/api/assets/:kind/:name` | Remove an asset. `409` if referenced by any config unless `?force=1`. |
| `GET` | `/preview/template` | The tool's own template (§5), same-origin, so the app can drive its `applyConfig`. |
| `GET` | `/asset?path=<abs>` | Serves a `file://` asset (photo/font/pdf) so the browser preview can load it. Only paths under the Automation root and with an asset extension; anything else is `400`/`403`. |
| `GET` | `/files/:scope/*` | Static serving of `out/`, `canva/`, `preview/`, `.gen/`, and the asset dirs. `scope` is whitelisted; path traversal is rejected. |

Static: `GET /*` serves the built SPA (`panel-kit/web/dist`) with an SPA fallback.

### 4.1 Run events (SSE)

```
event: log        data: { "stream": "stdout", "line": "…" }
event: problem    data: { "line": 12, "message": "top-level key after [table]" }
event: artifact   data: { "scope": "out", "path": "referral-growth-panel.png", "url": "/files/out/…" }
event: done       data: { "status": "ok" | "error", "exitCode": 0 }
```

The server parses the tool's own line-numbered problem messages into `problem` events so the
form can highlight the offending field/line. Final state is also readable via
`GET /api/runs/:runId`, so an agent that misses the stream still gets the result.

---

## 5. Preview vs. generate

- **Preview** (instant, no Chromium): the web app loads the tool's template from
  `/preview/template` in an iframe and calls its documented API — `window.applyConfig(json)` for
  zoom-banner, podcast-thumbnails, panel-social-posts; `window.__setSlide(svg)` / `window.__setDeck(list)`
  for g-slides (SVG built server-side). Input is the normalized sidecar from `--emit-json`, served
  with `file://` asset URLs rewritten to `/asset?path=…` so the browser can load real photos.
  Preview must never invoke Playwright.
- **Generate**: `POST …/generate` spawns `node gen.mjs <name> [flags]` with `cwd` = tool root,
  streams events, then lists artifacts. This is the only path that writes PNG/PDF/SVG.

---

## 6. Safety

- Path guard: every filesystem path is resolved and asserted inside the tool root (or an
  explicitly allowed sibling pool) before any read/write. Traversal → `400`.
- Uploads: extension whitelist per kind (`headshots`: jpg/jpeg/png/webp; `qrs`/`logos`: png/svg/jpg),
  no path separators in names, size cap.
- Deletes are limited to asset dirs; configs are deleted only via an explicit endpoint (v1: not
  exposed).
- The server never emails, publishes, or touches Google/Canva assets — it only reads/writes the
  local tool folder. (Mirrors the vault guardrail.)

---

## 7. Definition of done (v1)

- CLI unchanged except §2; `node gen.mjs …` output is byte-identical to before for the same TOML.
- Round-trip tests prove comments survive every write operation.
- Generating an unchanged config through the API produces output identical to the CLI.
- Each tool: `node gui.mjs` opens a working GUI; all §4 endpoints respond; agents can complete
  the list → read → edit → validate → generate loop over HTTP alone.

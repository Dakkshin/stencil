// Generic GUI/API server. One instance per tool; the tool supplies only its schema.

import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import { defineSchema } from "./schema.mjs";
import { parseToml, setValue, setArray, appendBlock, removeBlock } from "./toml-io.mjs";
import { getInventory } from "./inventory.mjs";
import { listAssets, saveAsset, deleteAsset, readConfig } from "./assets.mjs";
import { startRun, getRun } from "./runner.mjs";
import { assertName, safeResolve, safeScopePath } from "./paths.mjs";

const KIT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB_DIST = path.join(KIT_ROOT, "web", "dist");
const ASSET_EXT = /\.(png|jpe?g|webp|svg|gif|woff2?|ttf|otf|pdf)$/i;

const STATUS_BY_CODE = {
  BAD_NAME: 400,
  BAD_EXT: 400,
  TOO_LARGE: 413,
  BAD_FLAG: 400,
  PATH_TRAVERSAL: 400,
  VALIDATION_ERROR: 422,
  UNKNOWN_KIND: 404,
  NOT_FOUND: 404,
  REFERENCED: 409,
  STALE: 409,
};

const fail = (status, code, message, details) =>
  ({ status, body: { error: { code, message, ...(details ? { details } : {}) } } });

export function createServer({ schema: rawSchema, root }) {
  const schema = defineSchema(rawSchema);
  const toolRoot = path.resolve(root ?? process.cwd());
  const automationRoot = path.dirname(toolRoot);
  const token = randomUUID();
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  // Loopback only (also blunts DNS-rebinding): reject any other Host.
  app.use((req, res, next) => {
    const h = req.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return next();
    res.status(403).end();
  });

  // State-changing API calls must carry the per-process token (CSRF guard).
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    if (req.get("x-gui-token") === token) return next();
    res.status(403).json({ error: { code: "FORBIDDEN", message: "missing or invalid X-Gui-Token" } });
  });

  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  /* ------------------------------------------------------------- meta --- */

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, tool: schema.tool, token });
  });

  app.get("/api/schema", (req, res) => res.json(schema));

  app.get("/api/inventory", ah((req, res) => {
    const inv = getInventory(toolRoot);
    inv.items = inv.items.map((item) => ({
      ...item,
      mtime: mtimeOf(path.join(toolRoot, schema.configDir, `${item.name}.toml`)),
    }));
    res.json(inv);
  }));

  /* ----------------------------------------------------------- configs --- */

  app.get("/api/configs/:name", ah((req, res) => {
    const name = assertName(req.params.name);
    const cfg = readConfig(toolRoot, schema, name);
    if (!cfg) return res.status(404).json(fail(404, "NOT_FOUND", `no config ${name}`).body);
    res.json({ name, ...cfg });
  }));

  app.put("/api/configs/:name", ah((req, res) => {
    const name = assertName(req.params.name);
    const file = path.join(toolRoot, schema.configDir, `${name}.toml`);
    if (!fs.existsSync(file)) return res.status(404).json(fail(404, "NOT_FOUND", `no config ${name}`).body);

    const current = readConfig(toolRoot, schema, name);
    const { toml, ops, baseMtime } = req.body ?? {};
    if (baseMtime != null && Math.abs(Number(baseMtime) - current.mtime) > 1) {
      return res.status(409).json(fail(409, "STALE", "the file changed on disk since you loaded it").body);
    }

    let next;
    if (typeof toml === "string") {
      next = toml;
    } else if (Array.isArray(ops)) {
      next = current.toml;
      for (const op of ops) next = applyOp(next, op);
    } else {
      return res.status(400).json(fail(400, "VALIDATION_ERROR", "body needs { toml } or { ops }").body);
    }

    const parsed = parseToml(next);
    if (parsed.problems.length) {
      return res.status(422).json(fail(422, "VALIDATION_ERROR", "TOML is not valid; not saved", { problems: parsed.problems }).body);
    }
    fs.writeFileSync(file, next);
    res.json({ name, ...readConfig(toolRoot, schema, name) });
  }));

  app.post("/api/configs/:name/validate", ah((req, res) => {
    const name = assertName(req.params.name);
    const r = spawnSync(process.execPath, ["gen.mjs", name, "--emit-json"], { cwd: toolRoot, encoding: "utf8" });
    const payload = firstJsonObject(r.stdout);
    if (!payload) {
      return res.status(500).json(fail(500, "INTERNAL", "validate produced no JSON").body);
    }
    const result = payload.results?.find((x) => x.name === name) ?? payload.results?.[0] ?? {};
    let config;
    if (result.genPath) {
      try {
        const abs = safeResolve(toolRoot, result.genPath);
        if (fs.existsSync(abs)) config = JSON.parse(fs.readFileSync(abs, "utf8"));
      } catch {
        /* sidecar unreadable — preview just won't have a config */
      }
    }
    res.json({
      name,
      ok: !!result.ok,
      problems: result.problems ?? [],
      warnings: result.warnings ?? [],
      genPath: result.genPath ?? null,
      config: config ? rewriteFileUrls(config, automationRoot) : undefined,
    });
  }));

  app.post("/api/configs/:name/generate", ah((req, res) => {
    const name = assertName(req.params.name);
    const flags = Array.isArray(req.body?.flags) ? req.body.flags : [];
    const run = startRun({ root: toolRoot, schema, name, flags });
    res.status(202).json({ runId: run.runId });
  }));

  /* -------------------------------------------------------------- runs --- */

  app.get("/api/runs/:id", (req, res) => {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json(fail(404, "NOT_FOUND", "no such run").body);
    res.json(publicRun(run));
  });

  app.get("/api/runs/:id/events", (req, res) => {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json(fail(404, "NOT_FOUND", "no such run").body);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (ev) => res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    for (const ev of run.events) send(ev);
    if (run.status !== "running") return res.end();
    const sub = (ev) => {
      send(ev);
      if (ev.type === "done") {
        run.subscribers.delete(sub);
        res.end();
      }
    };
    run.subscribers.add(sub);
    req.on("close", () => run.subscribers.delete(sub));
  });

  /* --------------------------------------------------------- artifacts --- */

  app.get("/api/artifacts/:name", ah((req, res) => {
    const name = assertName(req.params.name);
    const inv = getInventory(toolRoot);
    const item = inv.items.find((i) => i.name === name);
    if (!item) return res.status(404).json(fail(404, "NOT_FOUND", `no config ${name}`).body);
    const cfgMtime = mtimeOf(path.join(toolRoot, schema.configDir, `${name}.toml`));
    const files = (item.outputs ?? []).map((rel) => {
      const abs = path.join(toolRoot, rel);
      const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
      return {
        scope: rel.split("/")[0],
        path: rel.split("/").slice(1).join("/"),
        url: `/files/${rel.split("/").map(encodeURIComponent).join("/")}`,
        stale: st ? st.mtimeMs < cfgMtime : false,
      };
    });
    res.json({ name, files });
  }));

  /* ------------------------------------------------------------ assets --- */

  app.get("/api/assets", ah((req, res) => res.json(listAssets(toolRoot, schema))));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
  app.post("/api/assets/:kind", upload.single("file"), ah((req, res) => {
    if (!req.file) return res.status(400).json(fail(400, "VALIDATION_ERROR", "multipart field 'file' is required").body);
    const name = req.body?.name ? assertName(req.body.name) : req.file.originalname;
    res.json(saveAsset(toolRoot, schema, req.params.kind, name, req.file.buffer));
  }));

  app.delete("/api/assets/:kind/:name", ah((req, res) => {
    const force = req.query.force === "1" || req.query.force === "true";
    res.json(deleteAsset(toolRoot, schema, req.params.kind, req.params.name, { force }));
  }));

  /* ------------------------------------------------------------ preview --- */

  // The tool's own template, served same-origin so the app can drive its
  // applyConfig()/__setSlide() API directly (exactly what render.mjs does).
  app.get("/preview/template", (req, res) => {
    const pv = schema.preview;
    if (!pv) return res.status(404).end();
    const key = String(req.query.name ?? "");
    const file = (pv.templates && pv.templates[key]) || pv.template;
    if (!file) return res.status(404).end();
    try {
      const abs = safeResolve(toolRoot, file);
      if (!fs.existsSync(abs)) return res.status(404).end();
      res.set("Cache-Control", "no-store");
      res.sendFile(abs);
    } catch {
      res.status(400).end();
    }
  });

  /* ------------------------------------------------------------ kit assets --- */

  // The templates reference shared design assets (fonts) by the relative path
  // "panel-kit/assets/…", which resolves under file:// for the renderer and here
  // over http for the live preview.
  app.get("/panel-kit/assets/*", (req, res, next) => {
    try {
      const abs = safeResolve(path.join(KIT_ROOT, "assets"), String(req.params[0]));
      if (!fs.existsSync(abs)) return next();
      res.sendFile(abs);
    } catch {
      res.status(400).end();
    }
  });

  /* --------------------------------------------------------- asset proxy --- */

  // The renderers resolve photos to file:// URLs. A browser on an http:// page
  // cannot load those, so the preview would fall back to placeholders. This
  // serves them over http instead — reachable only for asset files that live
  // under the Automation root (the tool plus its sibling shared pools).
  app.get("/asset", (req, res) => {
    const raw = String(req.query.path ?? "");
    if (!raw) return res.status(400).end();
    const abs = path.resolve(raw);
    if (!ASSET_EXT.test(abs)) return res.status(400).end();
    const rel = path.relative(automationRoot, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return res.status(403).end();
    if (!fs.existsSync(abs)) return res.status(404).end();
    res.sendFile(abs);
  });

  /* -------------------------------------------------------------- files --- */

  app.get("/files/*", (req, res, next) => {
    const [scope, ...rest] = String(req.params[0]).split("/");
    const allowed = new Set([
      ...Object.values(schema.assetDirs ?? {}),
      ...Object.values(schema.outDirs ?? {}),
      "preview",
    ]);
    if (!allowed.has(scope)) return next();
    try {
      const abs = safeScopePath(toolRoot, scope, rest.join("/"));
      if (!fs.existsSync(abs)) return next();
      res.sendFile(abs);
    } catch {
      res.status(400).end();
    }
  });

  /* ---------------------------------------------------------------- spa --- */

  if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/files")) return next();
      res.sendFile(path.join(WEB_DIST, "index.html"));
    });
  } else {
    app.get("/", (req, res) => {
      res.status(503).type("text/plain").send(
        "GUI not built yet.\n\n  cd panel-kit/web && npm install && npm run build\n\n" +
          "The HTTP API is available at /api/* meanwhile.\n"
      );
    });
  }

  /* ------------------------------------------------------------ errors --- */

  app.use((err, req, res, _next) => {
    const code = err?.code && STATUS_BY_CODE[err.code] ? err.code : "INTERNAL";
    const status = STATUS_BY_CODE[code] ?? 500;
    const message = code === "INTERNAL" ? "internal error" : err.message;
    if (status >= 500) console.error(`[panel-kit] ${err?.stack || err}`);
    res.status(status).json({ error: { code, message, ...(err?.details ? { details: err.details } : {}) } });
  });

  return { app, schema, token, root: toolRoot };
}

/* --------------------------------------------------------------- helpers --- */

function applyOp(toml, op) {
  switch (op?.op) {
    case "set":
      return setValue(toml, op.path, op.value);
    case "setArray":
      return setArray(toml, op.path, op.values);
    case "append":
      return appendBlock(toml, op.table, op.fields ?? {});
    case "remove":
      return removeBlock(toml, op.table, op.index);
    default: {
      const e = new Error(`unknown op: ${op?.op}`);
      e.code = "VALIDATION_ERROR";
      throw e;
    }
  }
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

function publicRun(run) {
  return {
    runId: run.runId,
    name: run.name,
    status: run.status,
    exitCode: run.exitCode,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    log: run.log,
    artifacts: run.artifacts,
  };
}

function firstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

/**
 * Point the preview at /asset instead of a filesystem path a browser cannot
 * load. Tools emit either a `file://` URL (zoom-banner, g-slides) or a bare
 * absolute path (podcast-thumbnails, panel-social-posts); handle both.
 */
function rewriteFileUrls(value, root) {
  if (typeof value === "string") {
    if (value.startsWith("file://")) {
      const abs = decodeURIComponent(value.slice("file://".length));
      return `/asset?path=${encodeURIComponent(abs)}`;
    }
    if (value.startsWith("/") && ASSET_EXT.test(value)) {
      const rel = path.relative(root, value);
      if (!rel.startsWith("..") && !path.isAbsolute(rel) && fs.existsSync(value)) {
        return `/asset?path=${encodeURIComponent(value)}`;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => rewriteFileUrls(v, root));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteFileUrls(v, root);
    return out;
  }
  return value;
}

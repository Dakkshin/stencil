// Run manager: spawns the tool's own `gen.mjs`, streams events, collects artifacts.
// The CLI remains the engine; this only orchestrates it.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";

const runs = new Map();
const KEEP_RUNS = 40;

export function getRun(runId) {
  return runs.get(runId);
}

export function startRun({ root, schema, name, flags = [] }) {
  const allowed = new Set(schema.generate?.flags ?? []);
  for (const f of flags) {
    if (!allowed.has(f)) {
      const e = new Error(`flag not allowed: ${f}`);
      e.code = "BAD_FLAG";
      throw e;
    }
  }

  const runId = randomUUID();
  const run = {
    runId,
    name,
    status: "running",
    exitCode: null,
    startedAt: Date.now(),
    endedAt: null,
    log: [],
    events: [],
    artifacts: [],
    subscribers: new Set(),
  };
  runs.set(runId, run);
  if (runs.size > KEEP_RUNS) runs.delete(runs.keys().next().value);

  const emit = (ev) => {
    run.events.push(ev);
    for (const s of run.subscribers) {
      try {
        s(ev);
      } catch {
        /* a dead subscriber must not break the run */
      }
    }
  };

  const child = spawn(process.execPath, ["gen.mjs", name, ...flags], { cwd: root });
  const pump = (stream, label) => {
    readline.createInterface({ input: stream }).on("line", (line) => {
      run.log.push(line);
      emit({ type: "log", stream: label, line });
      const problem = parseProblem(line);
      if (problem) emit({ type: "problem", ...problem });
    });
  };
  pump(child.stdout, "stdout");
  pump(child.stderr, "stderr");
  child.on("error", (err) => emit({ type: "log", stream: "stderr", line: String(err.message) }));
  child.on("close", (code) => {
    run.status = code === 0 ? "ok" : "error";
    run.exitCode = code;
    run.endedAt = Date.now();
    run.artifacts = listArtifactsSince(root, schema, run.startedAt);
    for (const a of run.artifacts) emit({ type: "artifact", ...a });
    emit({ type: "done", status: run.status, exitCode: code });
  });

  run.emit = emit;
  return run;
}

/** Pull the tool's own line-numbered messages out of the log so the form can point at them. */
function parseProblem(line) {
  const withLine = line.match(/(?:^|\s)line\s+(\d+):\s*(.+)$/i);
  if (withLine) return { line: Number(withLine[1]), message: withLine[2].trim() };
  const bullet = line.match(/^\s*[•\-]\s+(.+)$/);
  if (bullet) {
    const msg = bullet[1].trim();
    if (/(required|missing|needs|must be|not valid|unknown|past the|at most|no [[\w]|no valid|cannot build)/i.test(msg)) {
      return { line: null, message: msg };
    }
  }
  return null;
}

/** Files written into the schema's output dirs since the run started. */
export function listArtifactsSince(root, schema, since) {
  const out = [];
  for (const rel of Object.values(schema.outDirs ?? {})) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    let entries;
    try {
      entries = fs.readdirSync(abs, { recursive: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = path.join(abs, String(entry));
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (!st.isFile() || st.mtimeMs < since - 1500) continue;
      const relPath = String(entry);
      out.push({
        scope: rel,
        path: relPath,
        url: `/files/${rel}/${relPath.split(path.sep).map(encodeURIComponent).join("/")}`,
        mtime: st.mtimeMs,
      });
    }
  }
  return out.sort((a, b) => (a.scope + a.path).localeCompare(b.scope + b.path));
}

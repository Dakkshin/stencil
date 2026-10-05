/**
 * Slide-type registry: what slides exist, in what order, and what each one requires.
 *
 * The deck's length is DERIVED, never listed. A section renders only if its config
 * table is present, and "spotlights" fans out to one slide per speaker. That is what
 * makes "add a confirmed speaker" a one-line edit: append a stem, and the deck grows a
 * slide and renumbers every footer by itself.
 *
 * Rendering lives in render-svg.mjs. This file only knows about config.
 */

import { MAX_COVER_SPEAKERS } from "./geometry.mjs";

export const DEFAULT_ORDER = [
  "cover",
  "sponsor",
  "agenda",
  "stat",
  "spotlights",
  "offer_primary",
  "offer_secondary",
  "qa",
  "closing",
];

/* "spotlights" expands; "divider:Text" injects. Neither is a renderable type itself. */
export const FANOUT = "spotlights";
export const DIVIDER_PREFIX = "divider:";

export const SLIDE_TYPES = [
  "cover", "sponsor", "agenda", "divider", "stat", "spotlight",
  "offer_primary", "offer_secondary", "qa", "closing",
];

/** Slides that wear the full frame instead of the running footer. */
export const NO_FOOTER = new Set(["cover", "divider", "stat", "closing"]);

export const ORDER_TOKENS = new Set([...DEFAULT_ORDER.filter((t) => t !== FANOUT), FANOUT]);

/* Which top-level config table drives each section, so an absent table drops it. */
export const SECTION_TABLE = {
  cover: "cover",
  sponsor: "sponsor",
  agenda: "agenda",
  stat: "stat",
  offer_primary: "offer_primary",
  offer_secondary: "offer_secondary",
  qa: "qa",
  closing: "closing",
};

/**
 * Per-section content rules. Counts are deliberately tight: a five-item agenda is the
 * point where rows stop filling the band legibly, and three bio points is what the
 * spotlight rail is built for. Violating one is a build failure, not a layout puzzle
 * to solve at render time.
 */
export const LIMITS = {
  agendaTopics: { min: 4, max: 5, label: "[[topic]] entries" },
  benefits: { min: 3, max: 4, label: "[[benefit]] entries" },
  bio: { min: 3, max: 3, label: "speaker `bio` points" },
  tags: { min: 2, max: 3, label: "speaker `tags`" },
  // 4, not 3: four is what the sponsor rail holds when each quote is one line, and a
  // fifth stops fitting rather than getting smaller.
  proof: { min: 0, max: 4, label: "[[sponsor_proof]] entries" },
  titleLines: { min: 1, max: 3, label: "cover title lines" },
  coverSpeakers: { min: 1, max: MAX_COVER_SPEAKERS, label: "speakers on the cover" },
  secondaryItems: { min: 3, max: 5, label: "[offer_secondary] `items`" },
};

export function checkCount(arr, limit, problems, context = "") {
  const n = Array.isArray(arr) ? arr.length : 0;
  const where = context ? `${context}: ` : "";
  if (n < limit.min) problems.push(`${where}needs at least ${limit.min} ${limit.label} (found ${n})`);
  else if (n > limit.max) problems.push(`${where}allows at most ${limit.max} ${limit.label} (found ${n})`);
}

/**
 * Turn the configured order into the concrete slide sequence.
 *
 * Returns plain descriptors — `{ type, text? , speakerIndex? }`. gen.mjs fills in the
 * content and assigns `number` / `total` afterwards, so numbering always reflects what
 * actually survived rather than what was requested.
 */
export function deriveSequence(order, { present, speakerCount }) {
  const seq = [];
  const skipped = [];

  for (const token of order) {
    if (token.startsWith(DIVIDER_PREFIX)) {
      const text = token.slice(DIVIDER_PREFIX.length).trim();
      if (text) seq.push({ type: "divider", text });
      continue;
    }
    if (token === FANOUT) {
      for (let i = 0; i < speakerCount; i++) {
        seq.push({ type: "spotlight", speakerIndex: i, ordinal: i + 1, ofTotal: speakerCount });
      }
      if (!speakerCount) skipped.push(FANOUT);
      continue;
    }
    if (present.has(token)) seq.push({ type: token });
    else skipped.push(token);
  }

  return { sequence: seq, skipped };
}

/** Validate an `order` array before it is used, so a typo names itself. */
export function validateOrder(order, problems) {
  for (const token of order) {
    if (token.startsWith(DIVIDER_PREFIX)) {
      if (!token.slice(DIVIDER_PREFIX.length).trim()) {
        problems.push(`order entry "${token}" needs text after the colon, e.g. "divider:Meet the panel"`);
      }
      continue;
    }
    if (!ORDER_TOKENS.has(token)) {
      problems.push(
        `unknown order token "${token}" — expected one of ${[...ORDER_TOKENS].join(", ")}, ` +
          `or "divider:Your Text"`
      );
    }
  }
  const seen = new Set();
  for (const t of order) {
    if (t.startsWith(DIVIDER_PREFIX)) continue;
    if (seen.has(t)) problems.push(`order lists "${t}" more than once`);
    seen.add(t);
  }
}

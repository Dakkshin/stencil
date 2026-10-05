/**
 * Copy lint — flags wording that prompts/copy-system-prompt.md forbids or that
 * reads as machine-written. Warnings, not errors: a human decides. The first
 * group is quoted from the prompt's "Avoid" list; the rest are common tells.
 */
const RULES = [
  [/in today'?s (rapidly )?(changing|evolving)/i, `"In today's rapidly changing landscape" (prompt: avoid)`],
  [/unlock (your )?(the )?(full )?potential/i, `"Unlock your potential" (prompt: avoid)`],
  [/(take|taking) your practice to the next level/i, `"Take your practice to the next level" (prompt: avoid)`],
  [/game[- ]chang/i, `"game-changing" (prompt: avoid)`],
  [/revolutioni[sz]e/i, `"revolutionize" (prompt: avoid)`],
  [/navigat(e|ing) the complexit/i, `"navigate the complexities" (prompt: avoid)`],
  [/let us know your thoughts/i, `"Let us know your thoughts!" (prompt: avoid — ask a real question)`],
  [/\bunlock\b/i, `"unlock" — marketing verb`],
  [/\b(elevate|supercharge|empower|leverage|seamless(ly)?|cutting[- ]edge|robust|holistic|synergy)\b/i, "corporate/AI buzzword"],
  [/\bdelve\b|\btapestry\b|\blandscape\b|\brealm\b/i, "AI-tell vocabulary"],
  [/\b(dive|deep dive) (in|into)\b/i, `"dive into" — filler`],
  [/\bstrateg(y|ies) (that|to) (help|will)\b/i, "generic 'strategies that help' framing"],
  [/\b\d+ (ways|tips|secrets|steps) to\b/i, `listicle headline ("5 ways to…") — prompt calls this weak`],
  [/!{2,}|🚀|🔥|💡/u, "hype punctuation/emoji"],
  [/\u2014/u, "em dash: user asked for none on posts (use a full stop, comma or colon)"],
];

/** Returns [{ field, text, why }] for every rule hit. */
export function lintCopy(fields) {
  const hits = [];
  for (const [field, value] of Object.entries(fields)) {
    for (const text of [].concat(value || [])) {
      for (const [re, why] of RULES) if (re.test(String(text))) hits.push({ field, text: String(text), why });
    }
  }
  return hits;
}

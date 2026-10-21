// term detection. the detector is the "what is worth keeping" question
// answered structurally: a tech word, a proper noun, a number that is
// clearly a figure or a code. capture requests carry explicit keywords,
// but a keyword-less request ("get me the access code") still needs
// something to fire on, and a harvested term list is also useful context
// for the recap. detection is pattern-based and honest about its limits:
// it finds shape, not meaning, and its output is ranked candidates, never
// conclusions.

export type TermKind = "tech" | "proper_noun" | "math" | "code";

export interface DetectedTerm {
  term: string;
  kind: TermKind;
  count: number;
  sample: string; // the utterance it was first seen in, for context
}

// the seeded lexicon. deliberately small and generic: these are words that
// mean something technical in almost any meeting. the lexicon is not the
// product; the patterns below are, because shape generalizes and word
// lists do not.
const TECH_LEXICON = [
  "api",
  "endpoint",
  "webhook",
  "latency",
  "throughput",
  "rate limit",
  "oauth",
  "sso",
  "jwt",
  "idempotent",
  "race condition",
  "backpressure",
  "queue",
  "cache",
  "retry",
  "timeout",
  "schema",
  "migration",
  "cron",
  "kubernetes",
  "docker",
  "environment variable",
  "pull request",
  "merge conflict",
  "regression",
  "deploy",
  "rollback",
  "feature flag",
  "backlog",
  "sprint",
  "roadmap",
  "beta",
  "deprecated",
];

// capitalized sentence furniture that is never a proper noun. this list
// exists because mid-sentence capitalization is the signal, and common
// sentence-start-ish words would drown it.
const NOT_A_PROPER_NOUN = new Set([
  "I",
  "Okay",
  "Ok",
  "Yes",
  "Yeah",
  "No",
  "Please",
  "Thanks",
  "Thank",
  "Welcome",
  "Let",
  "Hi",
  "Hey",
  "Also",
  "But",
  "So",
  "And",
  "Then",
  "When",
  "What",
  "Where",
  "Why",
  "How",
  "This",
  "That",
  "These",
  "Those",
  "We",
  "They",
  "You",
  "It",
  "There",
  "Here",
  "My",
  "Our",
  "If",
  "One",
  "Two",
  "Now",
  "Well",
  "Actually",
  "Basically",
  "Sorry",
  "Right",
  "Sure",
]);

// code-shaped tokens: at least one digit, at least one letter, mostly
// caps/digits, four chars or more. "PRIXIE BUILD 2026 X9" is two words plus
// a year; the full code needs the multiword scan, the token scan catches
// the single-token forms (X9Q2, PRIXIE2026, BUILD-X9).
const CODE_TOKEN = /\b(?=[A-Z0-9-]{4,}\b)(?=[^\s]*\d)(?=[^\s]*[A-Z])[A-Z0-9-]+\b/g;
const CODE_PHRASE = /\b[A-Z]{3,}(?:\s+[A-Z0-9]{1,6}){2,}\b/g; // PRIXIE BUILD 2026 X9 shape

const ACRONYM = /\b[A-Z]{2,6}\b/g; // API, NASA, SSO
const UPPER_CAMEL = /\b[A-Z][a-z]{2,}(?:[A-Z][a-z]+)+\b/g; // SupabaseClient
const SNAKE_CASE = /\b[a-z]+(?:_[a-z0-9]+){1,}\b/g; // api_key, join_url
const SEMVER = /\bv?\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.]+)?\b/g;

// math that is actually spoken in meetings: money, percentages, units,
// magnitudes, equations. not arithmetic homework, figures.
const MONEY = /(?:^|\s)\$\s?\d[\d,]*(?:\.\d+)?/g;
const PERCENT = /\b\d[\d,]*(?:\.\d+)?\s?%/g;
const UNIT_NUMBER =
  /\b\d[\d,]*(?:\.\d+)?\s?(?:ms|s|sec|seconds|min|minutes|hours|hrs|days|gb|mb|kb|tb|qps|rps|rpm|fps|hz|khz|mhz|ghz|kbps|mbps|gbps|x)\b/gi;
const MAGNITUDE = /\b\d[\d,]*\s?(?:thousand|million|billion|trillion|k|m|bn)\b/gi;
const EQUATION = /\b[\w.]+\s*[=+*/^-]\s*[\w.]+(?:\s*[=+*/^-]\s*[\w.]+)*\b/g;
const HEX_COLOR = /#[0-9a-fA-F]{6}\b/g;

function collect(text: string, regex: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(regex)) {
    if (m[0] && m[0].trim().length > 0) out.push(m[0].trim());
  }
  return out;
}

// find the raw terms in one utterance, with the kind each one is.
export function detectTerms(
  text: string,
  extraTech: string[] = [],
): { term: string; kind: TermKind }[] {
  const found: { term: string; kind: TermKind }[] = [];
  const seen = new Set<string>();

  const push = (term: string, kind: TermKind) => {
    const key = `${kind}:${term.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ term, kind });
  };

  const lexicon = [...TECH_LEXICON, ...extraTech.map((t) => t.toLowerCase())];
  for (const word of lexicon) {
    // carry the casing of the utterance: she heard "API", not "api"
    const re = new RegExp(
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i",
    );
    const m = text.match(re);
    if (m) push(m[0], "tech");
  }

  // codes first: a code-shaped phrase is the crown jewel of a capture.
  // the phrase pattern is greedy over caps words, so run it before single
  // acronym scanning and skip acronym hits that sit inside a phrase.
  const codePhrases = collect(text, CODE_PHRASE);
  for (const phrase of codePhrases) push(phrase, "code");
  const phraseSpans = codePhrases.map((p) => p.split(/\s+/));

  for (const token of collect(text, CODE_TOKEN)) {
    if (phraseSpansContain(phraseSpans, token)) continue;
    push(token, "code");
  }

  for (const ac of collect(text, ACRONYM)) {
    if (phraseSpansContain(phraseSpans, ac)) continue;
    push(ac, "tech");
  }
  for (const t of collect(text, UPPER_CAMEL)) push(t, "tech");
  for (const t of collect(text, SNAKE_CASE)) {
    // a snake_case token is tech shape only when it reads like an
    // identifier, not a typo with an underscore
    if (t.includes("_")) push(t, "tech");
  }
  for (const t of collect(text, SEMVER)) push(t, "tech");

  // proper nouns: capitalized words that are not sentence furniture and
  // not at the very start of the text (the first word's capital is
  // grammar, not identity).
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^A-Za-z'-]/g, "");
    if (w.length < 3) continue;
    if (i === 0) continue;
    if (!/^[A-Z][a-z']/.test(w)) continue;
    if (NOT_A_PROPER_NOUN.has(w)) continue;
    push(w, "proper_noun");
  }

  for (const t of collect(text, MONEY)) push(t, "math");
  for (const t of collect(text, PERCENT)) push(t, "math");
  for (const t of collect(text, UNIT_NUMBER)) push(t, "math");
  for (const t of collect(text, MAGNITUDE)) push(t, "math");
  for (const t of collect(text, EQUATION)) push(t, "math");
  for (const t of collect(text, HEX_COLOR)) push(t, "math");

  return found;
}

function phraseSpansContain(
  phraseSpans: string[][],
  token: string,
): boolean {
  return phraseSpans.some((span) => span.includes(token));
}

// harvest across many utterances: count, rank, keep the first sample for
// context. ranked by count then by kind priority (a code beats a proper
// noun beats tech beats math), so the recap reads the good stuff first.
export function harvestTerms(
  utterances: { speaker: string; text: string }[],
  extraTech: string[] = [],
): DetectedTerm[] {
  const byKey = new Map<string, DetectedTerm>();
  const priority: Record<TermKind, number> = {
    code: 0,
    proper_noun: 1,
    tech: 2,
    math: 3,
  };

  for (const utt of utterances) {
    for (const { term, kind } of detectTerms(utt.text, extraTech)) {
      const key = `${kind}:${term.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count++;
      } else {
        byKey.set(key, {
          term,
          kind,
          count: 1,
          sample: `${utt.speaker}: ${utt.text}`,
        });
      }
    }
  }

  return [...byKey.values()].sort((a, b) =>
    priority[a.kind] - priority[b.kind] || b.count - a.count
  );
}

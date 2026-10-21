// eval harness for the profile-to-cue mapping. run:
//   deno test --allow-env --allow-net --allow-read tests/voice_cue_eval_test.ts
//
// scores every case in evals/voice_cues_seed.json and (when present)
// evals/voice_cues_adapted.json against voiceStyleFromProfile. cases marked
// gap=true and every adapted-source case are reported rather than failed:
// they are mapping extension candidates, not regressions. the point is a
// number and a list, not a green check hiding a thin mapping.

import { assertEquals } from "jsr:@std/assert@1";

Deno.env.set("MASKY_API_KEY", "mky_test");
Deno.env.set("RETELLDB_URL", "http://retelldb.test");

const { voiceStyleFromProfile } = await import("../server/handoff.ts");

interface Case {
  name: string;
  source: string;
  gap?: boolean;
  medium?: string;
  utterance?: string;
  profile: {
    tone: Record<string, number> | null;
    register?: Record<string, string>;
  };
  required: string[];
  forbidden: string[];
}

function cuesFromStyle(style: ReturnType<typeof voiceStyleFromProfile>): string[] {
  const cues: string[] = [];
  if (style.emotion) cues.push(`emotion=${style.emotion}`);
  if (style.style) cues.push(`style=${style.style}`);
  for (const p of style.prosody ?? []) cues.push(`prosody=${p}`);
  return cues;
}

// inline tags in the utterance are a requirement the mapping cannot satisfy
// today; they are tracked separately from the leading-cue requirements.
function inlineTags(utterance: string): string[] {
  return [...(utterance.matchAll(/<\|([a-z]+):([a-z_]+)\|>/g))].map((m) => `${m[1]}=${m[2]}`);
}

function score(c: Case) {
  const profile = c.profile?.tone
    ? {
      persona_id: c.name,
      lingvica: {
        register_by_medium: c.profile.register ?? {},
        tone_defaults: {
          warmth: c.profile.tone.warmth ?? 0.5,
          sarcasm_level: c.profile.tone.sarcasm_level ?? 0,
          playfulness: c.profile.tone.playfulness ?? 0.5,
          confidence: c.profile.tone.confidence ?? 0.5,
        },
      },
    }
    : null;

  const cues = cuesFromStyle(voiceStyleFromProfile(profile, c.medium ?? "call"));
  const leading = c.required.filter((r) => !r.includes("=") || !r.startsWith("sfx") && !["pitch_high", "long_pause", "pause"].includes(r.split("=")[1]));
  // split requirements: leading voiceStyle cues vs inline-tag cues
  const inlineRequired = c.required.filter((r) => r.startsWith("sfx=") || ["prosody=long_pause", "prosody=pause", "prosody=pitch_high", "prosody=pitch_low"].includes(r))
    // pitch cues are leading but the mapping never sets them; count them as missing either way
    ;
  const leadingRequired = c.required.filter((r) => !inlineRequired.includes(r));

  const missingLeading = leadingRequired.filter((r) => !cues.includes(r));
  const missingInline = inlineRequired.filter((r) => !inlineTags(c.utterance ?? "").includes(r));
  const violated = c.forbidden.filter((f) => cues.some((cue) => cue.startsWith(f)) || inlineTags(c.utterance ?? "").some((t) => t.startsWith(f)));

  return { cues, missingLeading, missingInline, violated };
}

async function loadCases(path: string | URL): Promise<Case[]> {
  try {
    const raw = await Deno.readTextFile(path);
    const parsed = JSON.parse(raw);
    return parsed.cases ?? [];
  } catch {
    return [];
  }
}

const seed = await loadCases(new URL("../evals/voice_cues_seed.json", import.meta.url));
const adapted = await loadCases(new URL("../evals/voice_cues_adapted.json", import.meta.url));
const all = [...seed, ...adapted];

const gaps: string[] = [];
let hardFailures = 0;
let passed = 0;

for (const c of all) {
  const { missingLeading, missingInline, violated } = score(c);
  const missing = [...missingLeading, ...missingInline];
  const isGap = c.gap === true || c.source !== "seed";

  if (violated.length) {
    hardFailures++;
    console.error(`VIOLATION ${c.name}: produced ${violated.join(", ")}`);
    continue;
  }
  if (missing.length === 0) {
    passed++;
    continue;
  }
  if (isGap) {
    gaps.push(`${c.name}: missing ${missing.join(", ")}`);
    continue;
  }
  hardFailures++;
  console.error(`FAIL ${c.name}: missing ${missing.join(", ")}`);
}

console.log(
  `\nvoice cue evals: ${all.length} cases (${seed.length} seed, ${adapted.length} adapted) | ` +
    `${passed} pass | ${gaps.length} mapping gaps | ${hardFailures} failures`,
);
if (gaps.length) {
  console.log("mapping gaps (extension candidates, not regressions):");
  for (const g of gaps) console.log(`  - ${g}`);
}

Deno.test("seed cases pass, gaps are reported not hidden", () => {
  assertEquals(hardFailures, 0, "no seed case may regress without an explicit gap flag");
  assertEquals(seed.length > 0, true, "seed set is present");
});

Deno.test("seed set covers both behaviour and known gaps", () => {
  assertEquals(seed.some((c) => !c.gap), true, "has passing behaviour cases");
  assertEquals(seed.some((c) => c.gap), true, "has documented gap cases");
});

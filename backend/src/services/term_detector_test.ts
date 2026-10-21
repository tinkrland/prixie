// term detector tests. the detector finds shape, not meaning: each test
// pins a shape and, just as importantly, the shapes it must NOT call terms.

import { assertEquals } from "jsr:@std/assert@1";
import { detectTerms, harvestTerms } from "./term_detector.ts";

function kinds(text: string, kind: string): string[] {
  return detectTerms(text)
    .filter((t) => t.kind === kind)
    .map((t) => t.term);
}

Deno.test("tech words are found from the lexicon", () => {
  const tech = kinds("we hit a rate limit on the oauth endpoint", "tech");
  assertEquals(tech.includes("rate limit"), true);
  assertEquals(tech.includes("oauth"), true);
  assertEquals(tech.includes("endpoint"), true);
});

Deno.test("identifier shapes are tech", () => {
  assertEquals(kinds("the api_key rotation failed", "tech").includes("api_key"), true);
  assertEquals(kinds("check the SupabaseClient logs", "tech").includes("SupabaseClient"), true);
  assertEquals(kinds("upgrade to v1.2.3 first", "tech").includes("v1.2.3"), true);
});

Deno.test("a spoken access code is a code", () => {
  const codes = kinds("the access code is PRIXIE BUILD 2026 X9", "code");
  assertEquals(codes.some((c) => c.startsWith("PRIXIE BUILD")), true);
  assertEquals(kinds("your code is X9Q2", "code").includes("X9Q2"), true);
});

Deno.test("acronyms are tech, not codes, and not double counted inside phrases", () => {
  const found = detectTerms("the SSO token expired");
  assertEquals(found.some((t) => t.term === "SSO" && t.kind === "tech"), true);
  // inside the code phrase PRIXIE BUILD 2026 X9, no word gets a second life
  // as an acronym or a lone code
  const phraseFound = detectTerms("the code is PRIXIE BUILD 2026 X9");
  const loneTokens = phraseFound.filter((t) => t.kind !== "code");
  assertEquals(
    loneTokens.some((t) => t.term === "PRIXIE" || t.term === "BUILD"),
    false,
  );
});

Deno.test("proper nouns are found, sentence furniture is not", () => {
  const pn = kinds("so Maria said Kubernetes is fine", "proper_noun");
  assertEquals(pn.includes("Maria"), true);
  // the first word's capital is grammar, not identity
  assertEquals(kinds("Maria joins the call", "proper_noun").length, 0);
  const noise = kinds("So Okay Yeah Actually I think it is fine", "proper_noun");
  assertEquals(noise.length, 0);
});

Deno.test("figures are math", () => {
  const math = kinds("it costs $19.99 and runs at 45% of 200ms", "math");
  assertEquals(math.some((m) => m.includes("$19.99")), true);
  assertEquals(math.some((m) => m.includes("45%")), true);
  assertEquals(math.some((m) => m.includes("200ms")), true);
  assertEquals(kinds("about 3 million users", "math").some((m) => /3\s?million/i.test(m)), true);
  assertEquals(kinds("x = 3.14 in the config", "math").length > 0, true);
});

Deno.test("plain speech produces no terms", () => {
  const found = detectTerms("i think it is a good idea to talk later");
  assertEquals(found.length, 0);
});

Deno.test("harvest counts, ranks, and keeps the first sample", () => {
  const harvested = harvestTerms([
    { speaker: "ana", text: "the API is down" },
    { speaker: "bob", text: "the api key also rotated" },
    { speaker: "ana", text: "so the API needs a rollback" },
    { speaker: "carol", text: "the code is BUILD 2026 X9" },
  ]);
  const api = harvested.find((t) => t.term.toLowerCase() === "api");
  assertEquals(api?.count, 3);
  assertEquals(api?.sample, "ana: the API is down");
  // a code outranks a frequent tech word
  const codeIdx = harvested.findIndex((t) => t.kind === "code");
  const apiIdx = harvested.findIndex((t) => t.term.toLowerCase() === "api");
  assertEquals(codeIdx > -1 && apiIdx > -1 && codeIdx < apiIdx, true);
});

// connections + memory scope + retelldb client: the identity-anchor rail.
//
// what these pin: a handle resolves to a person or honestly to nobody;
// normalization folds case/format but never identity; an ambiguous
// handle is a stranger, not a guess; a scope declares its platform even
// when no anchor exists; and every memory call carries the scope while
// staying a no-op when retelldb is unset.

import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  normalizeHandle,
  parseConnections,
  platformClass,
  resolveConnection,
  type Connection,
} from "./connections.ts";
import { provenanceTags, scopeFor, scopePayload } from "./memory_scope.ts";
import { ingestMemory, queryMemory } from "./retelldb.ts";

const CONNECTIONS: Connection[] = [
  {
    id: "owner",
    label: "the owner",
    owner: true,
    handles: {
      email: ["priya@example.com", "priya.work@example.com"],
      discord: ["111222333", "PriyaOnDiscord"],
      whatsapp: ["+15550001111"],
    },
  },
  {
    id: "rahul",
    label: "rahul",
    handles: {
      email: ["rahul@example.org"],
      discord: ["444555666"],
    },
  },
  {
    id: "clash-a",
    label: "clash a",
    handles: { email: ["shared@example.net"] },
  },
  {
    id: "clash-b",
    label: "clash b",
    handles: { email: ["shared@example.net"] },
  },
];

Deno.test("normalization folds what is the same and never what is not", () => {
  assertEquals(normalizeHandle("email", " Priya@Example.COM "), "priya@example.com");
  assertEquals(normalizeHandle("whatsapp", "+1 (555) 000-1111"), "+15550001111");
  assertEquals(normalizeHandle("whatsapp", "15550001111"), "15550001111");
  assertEquals(normalizeHandle("discord", "PriyaOnDiscord"), "priyaondiscord");
  assertEquals(normalizeHandle("discord", "111222333"), "111222333");
  // slack ids keep their case: folding them would collide
  assertEquals(normalizeHandle("slack", "U07ABC123"), "U07ABC123");
  assertEquals(normalizeHandle("email", ""), "");
});

Deno.test("platform classes decide privacy, not brands", () => {
  assertEquals(platformClass("discord"), "private");
  assertEquals(platformClass("email"), "private");
  assertEquals(platformClass("zoom"), "meeting");
  assertEquals(platformClass("twitch"), "public_social");
  assertEquals(platformClass("website"), "website");
  assertEquals(platformClass("myspace"), "unknown");
  assertEquals(platformClass(undefined), "unknown");
});

Deno.test("the same person resolves across every surface they hold", () => {
  for (const [platform, handle] of [
    ["email", "PRIYA@example.com"],
    ["discord", "priyaondiscord"],
    ["discord", "111222333"],
    ["whatsapp", "+1 555 000 1111"],
  ] as const) {
    const r = resolveConnection(platform, handle, CONNECTIONS);
    assertEquals(r.connection?.id, "owner", `expected owner on ${platform}`);
    assertEquals(r.reason, "anchored");
  }
  const other = resolveConnection("email", "rahul@example.org", CONNECTIONS);
  assertEquals(other.connection?.id, "rahul");
});

Deno.test("a stranger stays a stranger: unknown and ambiguous resolve to nobody", () => {
  assertEquals(resolveConnection("email", "stranger@example.com", CONNECTIONS).reason, "unknown_handle");
  // two anchors claim one handle: nobody, never a guess
  const clash = resolveConnection("email", "shared@example.net", CONNECTIONS);
  assertEquals(clash.connection, null);
  assertEquals(clash.reason, "ambiguous");
  // an empty handle is not a person
  assertEquals(resolveConnection("email", "", CONNECTIONS).reason, "unknown_handle");
});

Deno.test("config parses strictly, and a bad config anchors nobody", () => {
  const good = parseConnections(JSON.stringify([
    { id: "owner", label: "the owner", owner: true, handles: { email: ["a@b.co", ""] } },
    { label: "no id, dropped", handles: { email: ["x@y.co"] } },
    { id: "bare", handles: {} },
  ]));
  assertEquals(good.length, 2);
  assertEquals(good[0].owner, true);
  assertEquals(good[0].handles.email, ["a@b.co"]);
  assertEquals(good[1].label, "bare");
  assertEquals(parseConnections("not json").length, 0);
  assertEquals(parseConnections(JSON.stringify({ not: "an array" })).length, 0);
  assertEquals(parseConnections(undefined).length, 0);
});

Deno.test("a scope declares its platform even when nobody is anchored", () => {
  const anchored = scopeFor("email", "priya@example.com", { connections: CONNECTIONS });
  assertEquals(anchored.connection_id, "owner");
  assertEquals(anchored.anchor, "owner");
  assertEquals(anchored.platform, "email");

  const stranger = scopeFor("whatsapp", "+19998887777", { connections: CONNECTIONS });
  assertEquals(stranger.connection_id, null);
  assertEquals(stranger.anchor, "stranger");
  assertEquals(stranger.platform, "whatsapp");

  const noHandle = scopeFor("discord", undefined, { connections: CONNECTIONS });
  assertEquals(noHandle.connection_id, null);
  assertEquals(noHandle.anchor, "stranger");

  const clash = scopeFor("email", "shared@example.net", { connections: CONNECTIONS });
  assertEquals(clash.connection_id, null);
  assertEquals(clash.anchor, "ambiguous");

  const unconfigured = scopeFor("zoom", "x@y.co", { connections: [] });
  assertEquals(unconfigured.connection_id, null);
  assertEquals(unconfigured.anchor, "no_config");

  const persona = scopeFor("zoom", undefined, { connections: CONNECTIONS, personaId: "founder" });
  assertEquals(persona.persona_id, "founder");
});

Deno.test("provenance travels as tags and payload fields, unanchored included", () => {
  assertEquals(
    provenanceTags({ platform: "discord", connection_id: "owner" }),
    ["platform:discord", "connection:owner"],
  );
  assertEquals(provenanceTags({ platform: "zoom", connection_id: null }), ["platform:zoom"]);
  assertEquals(scopePayload({ platform: "email", connection_id: "owner", persona_id: "founder" }), {
    platform: "email",
    connection_id: "owner",
    persona_id: "founder",
  });
  assertEquals(scopePayload({ platform: "zoom", connection_id: null }), { platform: "zoom" });
});

Deno.test("memory calls carry the scope; unset retelldb is an honest no-op", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  Deno.env.delete("PRIXIE_RETELLDB_URL");
  try {
    // unset: no fetch, null / false
    globalThis.fetch = (async () => {
      throw new Error("must not fetch when unset");
    }) as typeof fetch;
    assertEquals(await queryMemory("what did we discuss", { platform: "discord", connection_id: "owner" }), null);
    assertEquals(await ingestMemory("note", { platform: "discord", connection_id: null }), false);

    // configured: the payload carries platform + connection
    Deno.env.set("PRIXIE_RETELLDB_URL", "http://retell.local:8000/");
    Deno.env.set("PRIXIE_RETELLDB_KEY", "k");
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            nodes: [{ node: { id: "n1", title: "t", type: "fact", content: "c", namespace: "shared", tags: ["platform:discord"] } }],
            dropped: [{ node_id: "n2", reason: "another person's context never crosses" }],
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await queryMemory("hi", { platform: "discord", connection_id: "owner", persona_id: "founder" });
    assertEquals(result?.nodes.length, 1);
    assertEquals(result?.dropped[0].reason, "another person's context never crosses");
    assertEquals(calls[0].url, "http://retell.local:8000/v1/query");
    assertEquals(calls[0].body.platform, "discord");
    assertEquals(calls[0].body.connection_id, "owner");
    assertEquals(calls[0].body.persona_id, "founder");

    assertEquals(await ingestMemory("she forwarded an invite", { platform: "email", connection_id: "owner" }), true);
    assertEquals(calls[1].url, "http://retell.local:8000/v1/ingest");
    assertEquals(calls[1].body.platform, "email");
    assertEquals(calls[1].body.connection_id, "owner");
    assertEquals(calls[1].body.format, "markdown");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("PRIXIE_RETELLDB_URL");
    Deno.env.delete("PRIXIE_RETELLDB_KEY");
  }
});

Deno.test("a failing head returns null, never a fabricated memory", async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set("PRIXIE_RETELLDB_URL", "http://retell.local:8000");
  try {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    assertEquals(await queryMemory("q", { platform: "email", connection_id: null }), null);
    assertEquals(await ingestMemory("c", { platform: "email", connection_id: null }), false);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("PRIXIE_RETELLDB_URL");
  }
});

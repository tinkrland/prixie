// memory scope: which surface is talking, and who is in front of her
// (anne, oct 29 2026).
//
// the spec's gap was that the surfaces never declared where they were.
// this file is the one place a surface builds that declaration, so the
// retelldb read rules (context branch: retelldb/routing/scope.py) have
// something to enforce against. the rules themselves are NOT duplicated
// here: the head enforces, the mouth declares. this file only builds the
// scope and the provenance tags that travel with writes.

import { platformClass, resolveConnection, type Connection } from "./connections.ts";

export interface MemoryScope {
  // the persona in play. undefined = shared memory, the stuff every
  // persona knows.
  persona_id?: string;
  // the surface. required: a scope without a platform is not a scope.
  platform: string;
  // who is in front of her on THAT surface, once resolved. null is a
  // legitimate answer (a stranger, or only a display name to go on).
  connection_id: string | null;
}

export interface BuiltScope extends MemoryScope {
  // how the connection was decided, for honest logs and receipts
  anchor: "anchored" | "owner" | "stranger" | "no_config" | "ambiguous";
}

// build a scope from the handle a surface actually holds. a display
// name is NOT a handle: callers that only have a name pass undefined and
// get an unanchored scope, which the head treats as a stranger session.
export function scopeFor(
  platform: string,
  handle: string | undefined | null,
  opts: { personaId?: string; connections?: Connection[] } = {},
): BuiltScope {
  const platformClassOf = platformClass(platform);
  if (platformClassOf === "unknown") {
    // an unknown surface declares itself honestly; the head drops
    // everything for it, which is the safe direction
    console.warn(`prixie: memory scope on an unknown platform: ${platform}`);
  }
  const resolution = resolveConnection(platform, handle, opts.connections);
  const connection = resolution.connection;
  return {
    persona_id: opts.personaId,
    platform: platform.trim().toLowerCase(),
    connection_id: connection?.id ?? null,
    anchor: connection ? (connection.owner ? "owner" : "anchored") : resolution.reason === "ambiguous"
      ? "ambiguous"
      : resolution.reason === "no_config"
      ? "no_config"
      : "stranger",
  };
}

// the tags a write carries so the read rules can hold it back later.
// same vocabulary as the python side: platform:<p>, connection:<id>.
export function provenanceTags(scope: MemoryScope): string[] {
  const tags = [`platform:${scope.platform}`];
  if (scope.connection_id) tags.push(`connection:${scope.connection_id}`);
  return tags;
}

// the query/ingest body fields the retelldb server understands. an
// unanchored scope still declares its platform: "a meeting, nobody
// anchored" is a real statement, and the head holds anchored memory
// back from it on purpose.
export function scopePayload(scope: MemoryScope): {
  platform: string;
  connection_id?: string;
  persona_id?: string;
} {
  return {
    platform: scope.platform,
    ...(scope.connection_id ? { connection_id: scope.connection_id } : {}),
    ...(scope.persona_id ? { persona_id: scope.persona_id } : {}),
  };
}

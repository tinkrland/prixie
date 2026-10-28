// webhook signature helpers (anne, oct 28 2026: the inbox rail gains
// providers). two schemes, both hmac-sha256 over the RAW body, both
// constant-time compared, both replay-gated by a timestamp:
//
// - dearagent.sh (self-hosted cloudflare worker): sha256=<hex> over
//   `${timestamp}.${rawBody}`, hex-encoded, secret is a plain string.
// - carlyemail.com (svix scheme): v1,<base64> over `${id}.${timestamp}.${rawBody}`,
//   base64-encoded, key is the base64-decoded secret (whsec_ prefix
//   stripped).
//
// the same rules as photon: a signature is verified on the raw body
// (never on a re-serialized copy), stale deliveries die (a captured
// delivery cannot be replayed later), and an unset secret means the
// door is closed, never open.

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  return hmacSha256Base64KeyBytes(new TextEncoder().encode(secret), message);
}

// svix (carlyemail): the signing secret is base64, the KEY is the
// decoded bytes themselves, not the base64 string re-encoded.
export async function hmacSha256Base64KeyBytes(keyBytes: Uint8Array<ArrayBuffer>, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function base64Decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64EncodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// replay gate: unix-seconds timestamps. a delivery older than five
// minutes is dead on arrival, whatever its signature says.
export function freshUnixSeconds(timestamp: string | undefined, maxAgeSeconds = 300): boolean {
  const t = Number(timestamp);
  if (!timestamp || !Number.isFinite(t)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - t) <= maxAgeSeconds;
}

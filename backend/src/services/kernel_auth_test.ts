// kernel_auth tests: the pure half of the login handoff. the rules that
// cannot bend and are tested structurally: only the meeting domain's
// cookies cross the bridge, the bitwarden source fails closed at every
// seam (unset token, missing cli, bad shape), the credential name is
// derived from the domain, and the sameSite spelling survives the
// playwright -> cdp crossing. the orchestration is thin glue over these
// and is covered by the route's contract, not mocked here.

import { assertEquals } from "jsr:@std/assert@1";
import {
  cdpSameSite,
  handoffDomains,
  cookieDomainMatches,
  credentialNameFor,
  flowTerminal,
  kernelAuthHandoffEnabled,
  parseBwsSecret,
  readPrixieCredential,
} from "./kernel_auth.ts";

Deno.test("the bridge carries only the meeting domains, never the whole jar", () => {
  const jar = [
    { domain: ".discord.com", name: "session" },
    { domain: "discord.com", name: "lang" },
    { domain: "cdn.discordapp.com", name: "asset" }, // sibling domain: crosses only when listed
    { domain: "accounts.google.com", name: "sso" }, // an sso detour: does not cross
    { domain: "example.com", name: "stranger" },
  ];
  // the primary domain alone: the sibling stays behind
  const primary = jar.filter((c) => cookieDomainMatches(c, "discord.com"));
  assertEquals(primary.map((c) => c.name), ["session", "lang"]);
  // the full handoff list: both registrable domains cross, nothing else
  const domains = ["discord.com", "discordapp.com"];
  const crossing = jar.filter((c) => domains.some((d) => cookieDomainMatches(c, d)));
  assertEquals(crossing.map((c) => c.name), ["session", "lang", "asset"]);
});

Deno.test("handoffDomains splits and trims the alias list", () => {
  assertEquals(handoffDomains("discord.com, discordapp.com"), ["discord.com", "discordapp.com"]);
  assertEquals(handoffDomains("discord.com"), ["discord.com"]);
  assertEquals(handoffDomains(""), []);
});

Deno.test("cookieDomainMatches: dot prefix and case are normalized, not trusted", () => {
  assertEquals(cookieDomainMatches({ domain: ".DISCORD.com" }, "discord.com"), true);
  assertEquals(cookieDomainMatches({ domain: "" }, "discord.com"), false);
  assertEquals(cookieDomainMatches({ domain: "notdiscord.com" }, "discord.com"), false);
});

Deno.test("bws source: a valid secret parses, everything else fails closed", async () => {
  const good = JSON.stringify({ username: "prixie", password: "s3cret", totp: "JBSWY3DPEHPK3PXP" });
  assertEquals(parseBwsSecret(good)?.username, "prixie");
  assertEquals(parseBwsSecret(good)?.totp, "JBSWY3DPEHPK3PXP");
  // password missing = not a credential, never a guess
  assertEquals(parseBwsSecret(JSON.stringify({ username: "prixie" })), null);
  assertEquals(parseBwsSecret("not json"), null);
  assertEquals(parseBwsSecret(""), null);
});

Deno.test("bws source: unset token means no credential, not an error", async () => {
  Deno.env.delete("PRIXIE_BWS_TOKEN");
  assertEquals(await readPrixieCredential("discord.com"), null);
});

Deno.test("bws source: the domain is the secret key, matched case-insensitively", async () => {
  Deno.env.set("PRIXIE_BWS_TOKEN", "test-token");
  try {
    const fakeRun = async () => ({
      success: true,
      stdout: JSON.stringify([
        { key: "unrelated.com", value: "{}" },
        { key: "Discord.com", value: JSON.stringify({ username: "prixie", password: "s3cret" }) },
      ]),
    });
    const cred = await readPrixieCredential("discord.com", fakeRun as any);
    assertEquals(cred?.username, "prixie");
    // cli failure (no bws on the box) fails closed too
    const dead = await readPrixieCredential("discord.com", (async () => ({ success: false, stdout: "" })) as any);
    assertEquals(dead, null);
  } finally {
    Deno.env.delete("PRIXIE_BWS_TOKEN");
  }
});

Deno.test("credential names are derived from the domain, sanitized", () => {
  assertEquals(credentialNameFor("discord.com"), "prixie-discord.com");
  assertEquals(credentialNameFor("Discord.GG/x y"), "prixie-discord.ggxy");
});

Deno.test("flow terminal states are exactly the four, in progress is not one", () => {
  assertEquals(flowTerminal("SUCCESS"), true);
  assertEquals(flowTerminal("FAILED"), true);
  assertEquals(flowTerminal("EXPIRED"), true);
  assertEquals(flowTerminal("CANCELED"), true);
  assertEquals(flowTerminal("IN_PROGRESS"), false);
  assertEquals(flowTerminal(undefined), false);
});

Deno.test("sameSite spelling survives playwright -> cdp", () => {
  assertEquals(cdpSameSite("strict"), "Strict");
  assertEquals(cdpSameSite("Lax"), "Lax");
  assertEquals(cdpSameSite("none"), "None");
  assertEquals(cdpSameSite(undefined), "Lax");
  assertEquals(cdpSameSite("garbage"), "Lax");
});

Deno.test("handoff disabled is the honest default without kernel creds", () => {
  Deno.env.delete("KERNEL_API_KEY");
  assertEquals(kernelAuthHandoffEnabled(), false);
});

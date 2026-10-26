// kernel managed auth: the login brain (the owner, oct 26 2026). browserbase
// stays the join engine; kernel owns exactly ONE moment, the oauth window
// a gated meeting puts in her way. the shape mirrors the payments rail:
// the handoff fires only when a login wall is met, kernel runs the login
// in ITS managed browser (prixie's own accounts, never the owner's, the same
// identity rule as the form rail), saves the session to a kernel profile,
// and the moment the session exists the kernel browser dies. then the
// bridge: the meeting-domain cookies ride one direction, kernel -> cdp ->
// browserbase, she reloads, and she is signed in ON browserbase. kernel
// never sees the meeting, browserbase never sees the password.
//
// the credential source is bitwarden, and the honest finding (researched
// oct 26 2026, kernel's openapi + docs): kernel's provider enum is exactly
// kernel | 1password and the auth service is not in the oss org (the oss
// side is browser infra: kernel-images, hypeman, neko, sdks), so there is
// no seam to add provider: bitwarden. but the documented "use an existing
// credential vault" pattern IS the bridge: the trusted backend (her) reads
// bitwarden and pre-stores the values as a kernel credential (a copy,
// sensitive, never returned through the api). bitwarden secrets manager is
// the right source here: a machine account token, no master password, a
// prixie project with one secret per domain, key = domain, value = json
// {username, password, totp?}. the bws CLI is the read path.
//
// three honest limits from the docs, kept in the open: pre-stored
// credentials only make HEADLESS login possible for credential-eligible
// flows, anything needing a code or approval still returns hosted_url and
// a human (the owner) does it once, kernel saves it, re-auth goes automatic
// after that (save_credentials: true, auto_reauth: true). the cookie copy
// is readable by the page after injection, so ONLY the meeting domain's
// cookies cross the bridge, never the whole jar. and kernel does not poll
// bitwarden: the sync is read-before-use, so bitwarden stays the source of
// truth.

import { KERNEL_BASE, kernelAuth, kernelConfigured } from "./kernel.ts";
import { cdpExecute } from "./browserbase.ts";

// --- the profile: one for all of prixie's logins, kernel keeps it ---

export function prixieProfileName(): string {
  return Deno.env.get("PRIXIE_KAUTH_PROFILE") || "prixie-logins";
}

export function kernelAuthHandoffEnabled(): boolean {
  return kernelConfigured();
}

// --- the bitwarden source (secrets manager, machine token, fail closed) ---

export interface PrixieCredential {
  username: string;
  password: string;
  totp?: string;
}

export function parseBwsSecret(raw: string): PrixieCredential | null {
  try {
    const v = JSON.parse(raw);
    if (typeof v?.username !== "string" || !v.username) return null;
    if (typeof v?.password !== "string" || !v.password) return null;
    return {
      username: v.username,
      password: v.password,
      ...(typeof v.totp === "string" && v.totp ? { totp: v.totp } : {}),
    };
  } catch {
    return null;
  }
}

// read prixie's own login for a domain from bitwarden secrets manager.
// the secret's key is the domain, the value is the json credential.
// unset token, missing cli, or a bad shape = null, never a guess: without
// bitwarden the handoff still works, the login just needs the owner once.
export async function readPrixieCredential(
  domain: string,
  run: (args: string[], env?: Record<string, string>) => Promise<{ success: boolean; stdout: string }> =
    defaultRun,
): Promise<PrixieCredential | null> {
  const token = Deno.env.get("PRIXIE_BWS_TOKEN");
  if (!token || !domain) return null;
  // bws secret list, then match by key: no ids in env, the domain is the id
  const r = await run(["secret", "list"], { BWS_ACCESS_TOKEN: token });
  if (!r.success) return null;
  let secrets: any[];
  try {
    secrets = JSON.parse(r.stdout);
  } catch {
    return null;
  }
  const hit = (Array.isArray(secrets) ? secrets : []) as Array<{ key?: string; value?: string }>;
  const match = hit.find((s) => s?.key?.toLowerCase() === domain.toLowerCase());
  if (!match || typeof match.value !== "string") return null;
  return parseBwsSecret(match.value);
}

async function defaultRun(args: string[], env?: Record<string, string>) {
  try {
    const cmd = new Deno.Command("bws", {
      args,
      env: { ...Deno.env.toObject(), ...env },
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    return { success: out.code === 0, stdout: new TextDecoder().decode(out.stdout) };
  } catch {
    return { success: false, stdout: "" }; // no bws on the box: fail closed
  }
}

// --- kernel credential pre-store (the bitwarden copy, sensitive) ---

export function credentialNameFor(domain: string): string {
  return `prixie-${domain.replace(/[^a-z0-9.-]/gi, "").toLowerCase()}`;
}

export async function createKernelCredential(
  domain: string,
  cred: PrixieCredential,
): Promise<string | null> {
  const name = credentialNameFor(domain);
  const res = await fetch(`${KERNEL_BASE}/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify({
      name,
      domain,
      values: {
        username: cred.username,
        password: cred.password,
        ...(cred.totp ? { totp_secret: cred.totp } : {}),
      },
    }),
  });
  if (!res.ok) return null; // the login can still run via hosted url
  return name;
}

// --- the connection: one per domain, on the prixie profile ---

export async function upsertAuthConnection(
  domain: string,
  credentialName: string | null,
): Promise<string | null> {
  const body: Record<string, unknown> = {
    domain,
    profile_name: prixieProfileName(),
    save_credentials: true, // eligible re-auth goes automatic after the first success
    auto_reauth: true,
  };
  if (credentialName) body.credential = { name: credentialName };
  const res = await fetch(`${KERNEL_BASE}/auth/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    const conn = await res.json();
    return conn?.id ?? null;
  }
  if (res.status === 409) {
    // the connection exists (the domain was handled before): reuse it
    const list = await fetch(
      `${KERNEL_BASE}/auth/connections?domain=${encodeURIComponent(domain)}&profile_name=${encodeURIComponent(prixieProfileName())}`,
      { headers: { "Authorization": kernelAuth() } },
    );
    if (!list.ok) return null;
    const found = await list.json();
    const arr = Array.isArray(found) ? found : found?.data ?? found?.connections ?? [];
    const match = arr.find((c: any) => c?.domain === domain);
    return match?.id ?? null;
  }
  return null;
}

// --- the login flow: automatic when eligible, hosted url when human ---

export interface LoginFlowOutcome {
  status: "authenticated" | "needs-user" | "failed";
  hostedUrl?: string;
  reason?: string;
}

export function flowTerminal(status: string | undefined): boolean {
  return status === "SUCCESS" || status === "FAILED" || status === "EXPIRED" || status === "CANCELED";
}

export async function startLoginFlow(connectionId: string): Promise<LoginFlowOutcome> {
  const res = await fetch(`${KERNEL_BASE}/auth/connections/${connectionId}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    return { status: "failed", reason: `login start failed: ${res.status}` };
  }
  const login = await res.json();

  // poll the flow to its terminal state. a credential-eligible flow
  // completes itself; anything else wants the human at hosted_url.
  const deadline = Date.now() + (Number(Deno.env.get("PRIXIE_KAUTH_WAIT_MS")) || 90_000);
  let flowStatus: string | undefined;
  while (Date.now() < deadline) {
    const conn = await fetch(`${KERNEL_BASE}/auth/connections/${connectionId}`, {
      headers: { "Authorization": kernelAuth() },
    });
    if (!conn.ok) break;
    const c = await conn.json();
    flowStatus = c?.flow_status;
    if (flowTerminal(flowStatus)) break;
    if (typeof login?.hosted_url === "string" && login.hosted_url) {
      // the flow is waiting on a human: hand the url up, keep polling
      // in case the human is the owner and she is fast
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (flowStatus === "SUCCESS") return { status: "authenticated" };
  if (login?.hosted_url) {
    return { status: "needs-user", hostedUrl: login.hosted_url, reason: "the login needs the owner once (a code or approval kernel cannot do itself)" };
  }
  return { status: "failed", reason: `flow ended ${flowStatus ?? "unknown"}` };
}

// --- the bridge: harvest the meeting-domain cookies, inject into browserbase ---

// a cookie crosses only if it belongs to the meeting domain (or a parent
// of it). the whole jar never crosses.
export function cookieDomainMatches(cookie: { domain?: string }, domain: string): boolean {
  const cd = (cookie.domain || "").toLowerCase().replace(/^\./, "");
  const d = domain.toLowerCase();
  return cd === d || cd.endsWith(`.${d}`);
}

export async function harvestProfileCookies(
  domain: string,
): Promise<Array<Record<string, unknown>> | null> {
  const domains = handoffDomains(domain);
  // the browser exists only to read the jar: created with the prixie
  // profile, queried through playwright (context.cookies sees httpOnly),
  // deleted the moment the read is done. nothing lingers on kernel's
  // side beyond the profile itself.
  const res = await fetch(`${KERNEL_BASE}/browsers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify({
      profile: { name: prixieProfileName() },
      stealth: true,
      headless: true,
    }),
  });
  if (!res.ok) return null;
  const b = await res.json();
  const browserId = b?.id;
  try {
    const exec = await fetch(`${KERNEL_BASE}/browsers/${browserId}/playwright/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
      body: JSON.stringify({ code: "return await context.cookies();" }),
    });
    if (!exec.ok) return null;
    const out = await exec.json();
    const cookies = out?.result;
    if (!Array.isArray(cookies)) return null;
    return cookies.filter((c: any) => domains.some((d) => cookieDomainMatches(c, d)));
  } finally {
    // the browser dies here no matter what: the read is the only moment
    await fetch(`${KERNEL_BASE}/browsers/${browserId}`, {
      method: "DELETE",
      headers: { "Authorization": kernelAuth() },
    }).catch(() => {});
  }
}

// playwright's sameSite spelling to cdp's: Strict/Lax/None
export function cdpSameSite(playwrightSameSite: string | undefined): string {
  const v = (playwrightSameSite || "").toLowerCase();
  if (v === "strict") return "Strict";
  if (v === "lax") return "Lax";
  if (v === "none") return "None";
  return "Lax"; // playwright's default, spelled the cdp way
}

export async function injectCookiesToBrowserbase(
  sessionId: string,
  cookies: Array<Record<string, unknown>>,
): Promise<number> {
  let injected = 0;
  for (const c of cookies) {
    const cookie = c as { name?: string; value?: string; domain?: string; path?: string; secure?: boolean; httpOnly?: boolean; sameSite?: string; expires?: number };
    const r = await cdpExecute(sessionId, "Network.setCookie", {
      name: cookie.name,
      value: cookie.value,
      domain: (cookie.domain || "").replace(/^\./, "") || undefined,
      path: cookie.path || "/",
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      sameSite: cdpSameSite(cookie.sameSite),
      ...(typeof cookie.expires === "number" && cookie.expires > 0 ? { expires: cookie.expires } : {}),
    });
    if (r?.result === true || r?.result?.success === true) injected++;
  }
  return injected;
}

// --- the handoff itself: one function, called at the wall ---

export interface HandoffResult {
  status: "authenticated" | "needs-user" | "failed" | "disabled";
  injectedCookies?: number;
  hostedUrl?: string;
  reason?: string;
}

// some logins span sibling registrable domains (discord.com and
// discordapp.com are two domains, not a subdomain), so the caller may
// pass a comma-separated list: every listed domain's cookies cross.
export function handoffDomains(domain: string): string[] {
  return domain.split(",").map((d) => d.trim()).filter(Boolean);
}

// called by the join engine the moment a meeting demands a login
// browserbase cannot walk past. kernel logs in (bitwarden's copy if
// it is there, the owner once if it is not), the meeting-domain cookies
// cross the bridge, and the caller reloads on browserbase, signed in.
export async function handoffLoginToKernel(
  domain: string,
  bbSessionId: string | undefined,
): Promise<HandoffResult> {
  if (!kernelAuthHandoffEnabled()) {
    return { status: "disabled", reason: "kernel managed auth is not configured (KERNEL_API_KEY unset): the join engine reports the wall honestly" };
  }
  const cred = await readPrixieCredential(domain);
  const credentialName = cred ? await createKernelCredential(domain, cred) : null;
  const connectionId = await upsertAuthConnection(domain, credentialName);
  if (!connectionId) {
    return { status: "failed", reason: "could not establish a kernel auth connection" };
  }
  const outcome = await startLoginFlow(connectionId);
  if (outcome.status !== "authenticated") {
    return outcome;
  }
  const cookies = await harvestProfileCookies(domain);
  if (!cookies || cookies.length === 0) {
    return { status: "failed", reason: "login succeeded but the session jar came back empty for the domain" };
  }
  if (!bbSessionId) {
    return { status: "authenticated", injectedCookies: cookies.length };
  }
  const injected = await injectCookiesToBrowserbase(bbSessionId, cookies);
  return { status: "authenticated", injectedCookies: injected };
}

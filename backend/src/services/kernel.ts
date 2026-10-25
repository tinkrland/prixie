// kernel.sh client (the owner, oct 25 2026): the payment-vault engine. browserbase
// remains the join engine; kernel owns exactly ONE moment, the checkout step
// that needs a card so a gateway-level promo can apply. the rule does not
// bend: prixie never sees, types, stores, or logs a card number, ever. the
// vault fill operation is kernel's to do, and the browser dies the moment the
// payment portion is managed.
//
// the seam is the same shape as browserbase: a session id plus cdp_ws_url
// (the browser object carries it natively), so the horizon stays swappable.
// driving here goes through kernel's HTTP surface instead: the browser REPL
// exposes a verified automation kit (js / pageInfo / fillInput / click /
// waitForElement / accessibilitySnapshot), probed live oct 25 2026.

const KERNEL_BASE = Deno.env.get("KERNEL_BASE") || "https://api.onkernel.com";

function kernelAuth(): string {
  const key = Deno.env.get("KERNEL_API_KEY");
  return key ? `Bearer ${key}` : "";
}

export function kernelConfigured(): boolean {
  return Boolean(Deno.env.get("KERNEL_API_KEY"));
}

export interface KernelBrowser {
  id: string;
  cdp_ws_url: string; // the seam: native on the browser object, kept for the horizon
}

// create a stealth browser session. no card, no profile, nothing persists
// beyond the handoff: it is deleted the moment the checkout is done.
export async function createKernelBrowser(startUrl?: string): Promise<KernelBrowser> {
  const res = await fetch(`${KERNEL_BASE}/browsers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify({
      name: "prixie",
      stealth: true, // captcha solver + fingerprints: checkouts are hostile to bots
      headless: true,
      ...(startUrl ? { start_url: startUrl } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`kernel browser create failed: ${res.status} ${await res.text()}`);
  }
  const b = await res.json();
  return { id: b.id, cdp_ws_url: b.cdp_ws_url };
}

// the browser dies immediately after the payment portion: nothing of the
// checkout lingers on kernel's side either
export async function stopKernelBrowser(id: string): Promise<void> {
  await fetch(`${KERNEL_BASE}/browsers/${id}`, {
    method: "DELETE",
    headers: { "Authorization": kernelAuth() },
  });
}

export interface ReplResult {
  ok: boolean;
  out: string; // joined stdout
  error?: string;
}

// evaluate code in the browser REPL. output is honest: console.log only,
// top-level return is not supported (verified live).
export async function kernelRepl(id: string, code: string): Promise<ReplResult> {
  const res = await fetch(`${KERNEL_BASE}/browsers/${id}/repl`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    return { ok: false, out: "", error: `repl http ${res.status}` };
  }
  const r = await res.json();
  const out = (r.content || [])
    .filter((c: any) => c.channel === "stdout")
    .map((c: any) => c.text)
    .join("\n");
  return { ok: !r.error, out, error: r.error };
}

// read a value from the page: a JSON expression evaluated in page context
// (the REPL's js() binding), parsed back. null on any failure: callers
// fail closed, never on a guess.
export async function kernelJs(id: string, expr: string): Promise<any> {
  const r = await kernelRepl(
    id,
    `console.log(JSON.stringify(await js(${JSON.stringify(expr)})))`,
  );
  if (!r.ok || !r.out) return null;
  try {
    return JSON.parse(r.out);
  } catch {
    return null;
  }
}

export interface KernelPageInfo {
  url: string;
  title: string;
  ready_state?: string;
}

export async function kernelPageInfo(id: string): Promise<KernelPageInfo | null> {
  const r = await kernelRepl(id, `console.log(JSON.stringify(await pageInfo()))`);
  if (!r.ok || !r.out) return null;
  try {
    const p = JSON.parse(r.out);
    return { url: p.url, title: p.title, ready_state: p.ready_state };
  } catch {
    return null;
  }
}

export async function kernelGoto(id: string, url: string): Promise<boolean> {
  const r = await kernelRepl(id, `await gotoUrl(${JSON.stringify(url)})`);
  return r.ok;
}

// type a value into a css-selected field. the ONLY selectors this client's
// callers may pass are code/email/name fields: the card portion is the
// vault's, never typed by prixie.
export async function kernelFillInput(
  id: string,
  selector: string,
  value: string,
): Promise<boolean> {
  const r = await kernelRepl(
    id,
    `await fillInput(${JSON.stringify(selector)}, ${JSON.stringify(value)})`,
  );
  return r.ok;
}

// does a css selector exist on the page (waited briefly)?
export async function kernelElementExists(id: string, selector: string): Promise<boolean> {
  const r = await kernelRepl(
    id,
    `await waitForElement(${JSON.stringify(selector)}).then(()=>true).catch(()=>false)`,
  );
  return r.ok && r.out.trim() === "true";
}

// click the first element whose visible text matches one of the given
// labels (case-insensitive, substring). kernel's click takes css only
// (verified live), so the find+click is one dom click in page context.
export async function kernelClickText(
  id: string,
  labels: string[],
  scope = "button, a, summary, div[role='button'], span[role='button'], input[type='submit']",
): Promise<boolean> {
  const expr = `(() => {
    const scope = ${JSON.stringify(scope)};
    const labels = ${JSON.stringify(labels.map((l) => l.toLowerCase()))};
    for (const el of document.querySelectorAll(scope)) {
      const t = (el.innerText || el.value || "").trim().toLowerCase();
      if (t && labels.some((l) => t.includes(l))) { el.click(); return true; }
    }
    return false;
  })()`;
  const v = await kernelJs(id, expr);
  return v === true;
}

// screenshot as base64 png (the http endpoint returns raw bytes)
export async function kernelScreenshotB64(id: string): Promise<string> {
  const res = await fetch(`${KERNEL_BASE}/browsers/${id}/computer/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify({}),
  });
  if (!res.ok) return "";
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin);
}

// --- the vault: kernel's managed payment methods ---

export interface VaultItemSummary {
  key: string;
  type: string;
  masked_last4?: string;
  status?: string;
}

// list the card items in a vault. masks only: whatever last4 kernel
// reports is masked data kernel produced, never digits prixie read.
export async function listVaultCardItems(
  vaultName: string,
): Promise<VaultItemSummary[]> {
  const res = await fetch(`${KERNEL_BASE}/vaults/${vaultName}/items`, {
    headers: { "Authorization": kernelAuth() },
  });
  if (!res.ok) return [];
  const items = await res.json();
  const arr = Array.isArray(items) ? items : (items.items || []);
  return arr
    .filter((it: any) => (it.type || "").toLowerCase().includes("card"))
    .map((it: any) => ({
      key: it.key,
      type: it.type,
      masked_last4: it.state?.masks?.last4 || it.state?.last4_masked || undefined,
      status: it.state?.status,
    }));
}

export async function listVaultNames(): Promise<string[]> {
  const res = await fetch(`${KERNEL_BASE}/vaults`, {
    headers: { "Authorization": kernelAuth() },
  });
  if (!res.ok) return [];
  const vaults = await res.json();
  const arr = Array.isArray(vaults) ? vaults : (vaults.vaults || []);
  return arr.map((v: any) => v.name || v.id).filter(Boolean);
}

export interface VaultFillResult {
  ok: boolean;
  detail: string;
}

// THE HANDOFF MOMENT: kernel fills the vault card into the checkout page
// open in browser_id. prixie's role ends at asking; the card digits pass
// from kernel's vault to the page, never through her.
export async function kernelVaultFill(
  vaultName: string,
  itemKey: string,
  browserId: string,
  pageUrl: string,
): Promise<VaultFillResult> {
  const res = await fetch(
    `${KERNEL_BASE}/vaults/${vaultName}/items/${itemKey}/operations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
      body: JSON.stringify({
        type: "fill",
        browser_id: browserId,
        page_url: pageUrl,
      }),
    },
  );
  if (!res.ok) {
    return { ok: false, detail: `vault fill http ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const r = await res.json();
  const status = r.status || r.state?.status || "unknown";
  return {
    ok: status === "completed",
    detail: status === "completed"
      ? "vault card filled by kernel"
      : `vault fill status: ${status}`,
  };
}

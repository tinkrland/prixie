// the vault checkout: the momentary handoff to kernel (the owner, oct 25 2026).
//
// the shape of the problem: some promo codes do not apply on the site's
// own page, they apply inside the payment gateway's checkout, so even
// APPLYING the code requires a card entry. browserbase has no payment
// vault; prixie never touches cards. so the handoff: the checkout step,
// and only the checkout step, runs in a kernel browser with the owner's vault
// card (the $5 buffer card, never her main one). kernel's vault fill
// operation puts the card in; prixie never sees a digit. the kernel
// browser is deleted the moment the payment portion is managed, and the
// reporting (email, capture record) is hers again.
//
// the money rule does not bend: the vault is not a shopping budget. the
// only checkout she completes is one that costs NOTHING after the promo
// ("$0.00 total", "free"). anything else: she stops before the pay
// button and says what the page showed. the owner spends money, not prixie.

import {
  createKernelBrowser,
  kernelClickText,
  kernelElementExists,
  kernelFillInput,
  kernelJs,
  kernelPageInfo,
  kernelScreenshotB64,
  kernelVaultFill,
  listVaultCardItems,
  listVaultNames,
  stopKernelBrowser,
  type VaultItemSummary,
} from "./kernel.ts";
import { CODE_SELECTORS, REDEEM_TEXTS } from "./promo.ts";
import { assertLinkSafe } from "./link_safety.ts";
import { theUrlTell } from "./theurltell/mod.ts";

export interface VaultCheckoutReceipt {
  url: string;
  attempted: boolean;
  promo_applied: boolean; // a code field was found and the code landed
  email_filled: boolean;
  vault_filled: boolean; // kernel put the card in, or tried to
  card_masked?: string; // masked last4 from kernel's vault item, never digits
  total_read: string; // what the page showed after the promo
  total_free: boolean; // parsed: $0 / free. fail closed: unknown is not free
  completed: boolean; // the pay button was clicked on a free total
  stopped_reason?: string; // why she stopped; there is always a reason
  detail: string;
}

// pure: does this situation call for the handoff at all? a checkout
// with no promo code is still a hard stop: the vault exists so a
// gateway-level promo can apply, not to buy things. and without the
// kernel key the handoff is a no-op, never a silent attempt.
export function vaultHandoffWanted(opts: {
  cc_detected: boolean;
  promoCode?: string | null;
  kernelConfigured: boolean;
}): boolean {
  return opts.cc_detected && Boolean(opts.promoCode) && opts.kernelConfigured;
}

// pure: is the total free? the words on the page are the only evidence.
// a total-shaped line reading $0.00 (or 0,00, or "free") is free; any
// nonzero amount is not; no readable total is NOT free (fail closed,
// she stops and reports rather than clicks pay on an unknown).
const TOTAL_LINE =
  /(?:total|amount|due|charge|pay)[^.\n]{0,48}[:\s]?\$?\s*([0-9]+[.,][0-9]{2})/gi;

export function totalIsFree(pageText: string): boolean {
  const matches = [...pageText.matchAll(TOTAL_LINE)];
  if (matches.length === 0) {
    // "free" only counts when a total context says it: "total: free"
    return /\btotal\b[^.\n]{0,40}\bfree\b|\bfree\b[^.\n]{0,40}\btotal\b/i.test(pageText);
  }
  return matches.every((m) => {
    const n = parseFloat(m[1].replace(",", "."));
    return n === 0;
  });
}

// pure: pick the card item to hand off to. env names win
// (KERNEL_VAULT / KERNEL_VAULT_CARD), else the first vault with a
// card item. masked data only.
export function pickVaultCard(
  vaultNames: string[],
  cardsByVault: Record<string, VaultItemSummary[]>,
  envVault?: string,
  envCard?: string,
): { vault: string; card: VaultItemSummary } | null {
  if (envVault && envCard && (cardsByVault[envVault] || []).length > 0) {
    const card = cardsByVault[envVault].find((c) => c.key === envCard);
    if (card) return { vault: envVault, card };
  }
  for (const v of vaultNames) {
    const card = (cardsByVault[v] || [])[0];
    if (card) return { vault: v, card };
  }
  return null;
}

const VAULT_EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[placeholder*="email" i]',
  'input[id*="email" i]',
];

// pay-shaped labels, clicked only on a parsed-free total
const PAY_TEXTS = [
  "pay", "subscribe", "start trial", "start free trial", "complete purchase",
  "place order", "confirm", "get started",
];
// advance-shaped labels for walking to the payment step without paying
const ADVANCE_TEXTS = ["continue", "next", "review", "go to checkout", "checkout"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// the handoff. returns a receipt, never a promise: every stop says why.
export async function vaultCheckout(
  url: string,
  promoCode: string,
  identity: { email: string; name?: string },
): Promise<VaultCheckoutReceipt> {
  const receipt: VaultCheckoutReceipt = {
    url,
    attempted: false,
    promo_applied: false,
    email_filled: false,
    vault_filled: false,
    total_read: "",
    total_free: false,
    completed: false,
    detail: "",
  };

  // same gates as enterForm: she only ever opens a told, safe destination
  const tell = await theUrlTell(url);
  if (!tell.destination) {
    receipt.stopped_reason = `link not opened: ${tell.reason}`;
    receipt.detail = receipt.stopped_reason;
    return receipt;
  }
  const verdict = await assertLinkSafe(tell.destination);
  if (!verdict.safe) {
    receipt.stopped_reason = `link blocked by safety gate: ${verdict.reason}`;
    receipt.detail = receipt.stopped_reason;
    return receipt;
  }

  // the vault pick happens before any browser exists: no card, no handoff
  const envVault = Deno.env.get("KERNEL_VAULT");
  const envCard = Deno.env.get("KERNEL_VAULT_CARD");
  const vaultNames = envVault ? [envVault, ...await listVaultNames()] : await listVaultNames();
  const cardsByVault: Record<string, VaultItemSummary[]> = {};
  for (const v of [...new Set(vaultNames)]) {
    cardsByVault[v] = await listVaultCardItems(v);
  }
  const picked = pickVaultCard([...new Set(vaultNames)], cardsByVault, envVault, envCard);
  if (!picked) {
    receipt.stopped_reason =
      "no vault card configured: the owner's buffer card is not enrolled in kernel yet (env KERNEL_VAULT / KERNEL_VAULT_CARD, or a card item in any vault)";
    receipt.detail = receipt.stopped_reason;
    return receipt;
  }
  receipt.card_masked = picked.card.masked_last4;

  receipt.attempted = true;
  let browserId = "";
  try {
    const browser = await createKernelBrowser(tell.destination);
    browserId = browser.id;
    await sleep(4000); // let the page settle

    // promo first, same order as enterForm: the redeem button often
    // lives outside the checkout. a gateway-only promo has no code
    // field here, and that is expected, not a failure: the code applies
    // inside the checkout itself.
    if (await kernelClickText(browserId, REDEEM_TEXTS)) {
      await sleep(1500);
      for (const sel of CODE_SELECTORS) {
        if (await kernelElementExists(browserId, sel)) {
          receipt.promo_applied = await kernelFillInput(browserId, sel, promoCode);
          if (receipt.promo_applied) {
            await kernelClickText(browserId, ["apply", "redeem", "submit", "go"]);
            break;
          }
        }
      }
    }

    // email: hers to enter, like every form. the card: never.
    for (const sel of VAULT_EMAIL_SELECTORS) {
      if (await kernelFillInput(browserId, sel, identity.email)) {
        receipt.email_filled = true;
        break;
      }
    }

    // walk toward the payment step without ever clicking pay-shaped
    let walked = 0;
    while (walked < 3) {
      const advanced = await kernelClickText(
        browserId,
        ADVANCE_TEXTS,
        "button, a, div[role='button'], input[type='submit']",
      );
      if (!advanced) break;
      await sleep(2500);
      walked++;
    }

    // THE HANDOFF MOMENT: kernel's vault fills the card into the page
    // open in this browser. the digits pass vault -> page, never
    // through prixie.
    const info = await kernelPageInfo(browserId);
    const fill = await kernelVaultFill(
      picked.vault,
      picked.card.key,
      browserId,
      info?.url || tell.destination,
    );
    receipt.vault_filled = fill.ok;
    if (!fill.ok) {
      receipt.stopped_reason = `vault fill did not complete: ${fill.detail}`;
      receipt.detail = receipt.stopped_reason;
      await kernelScreenshotB64(browserId).catch(() => "");
      return receipt;
    }
    await sleep(2000);

    // the total, from the words on the page. free or she stops.
    const bodyText = await kernelJs(
      browserId,
      "document.body?.innerText?.slice(0, 8000) || ''",
    );
    receipt.total_read = String(bodyText || "").slice(0, 400);
    receipt.total_free = totalIsFree(receipt.total_read);
    if (!receipt.total_free) {
      receipt.stopped_reason =
        "total after promo was not free (or unreadable): she stopped before the pay button. the vault card was not charged. the owner decides";
      receipt.detail = receipt.stopped_reason;
      return receipt;
    }

    // free: complete it
    receipt.completed = await kernelClickText(browserId, PAY_TEXTS);
    await sleep(4000); // let the confirmation settle
    if (receipt.completed) {
      const after = await kernelPageInfo(browserId);
      receipt.detail = `vault checkout completed at a $0 total${after ? ` (now: ${after.title})` : ""}`;
    } else {
      receipt.stopped_reason = "free total but no pay-shaped button found";
      receipt.detail = receipt.stopped_reason;
    }
    return receipt;
  } catch (err: any) {
    receipt.stopped_reason = `vault checkout errored: ${err.message}`;
    receipt.detail = receipt.stopped_reason;
    return receipt;
  } finally {
    // the browser dies the moment the payment portion is managed (or
    // the attempt gave up): nothing of the checkout lingers on kernel
    if (browserId) await stopKernelBrowser(browserId).catch(() => {});
  }
}

// the payments rails (the owner, oct 25 2026): the card moment, twice over.
//
// the shape of the problem did not change: some promos apply only inside
// a gateway checkout, the checkout demands a card, and prixie's money
// rule does not bend. only a $0 total after the promo ever completes.
// what changed oct 25 2026 is that there are now TWO honest ways to put
// a card in, and they are not equal:
//
//   kernel rail (kernel.sh vault, provider link or agentcard.sh): the
//   card item is created per checkout, bound to the checkout's origin
//   and an amount cap, one time use. kernel's fill types it in. digits
//   pass vault -> page and never through prixie. the price: a human
//   approves each purchase (the owner's phone, an email link), so this rail
//   parks for approval instead of finishing alone.
//
//   agentcard rail (agentcard.ai, the alchemy product): the CLI prints
//   a one-time card, capped to the requested amount, dead in 7 days,
//   funded by a hold on the buffer card. instant, no approval. the
//   price: the digits pass through prixie's process memory once. the owner's
//   carve-out (oct 25 2026) covers exactly this and nothing else: issued
//   one-time cards from the agentcard CLI may be typed, real cards may
//   never be. nothing is logged, stored, or receipted but the last4.
//
// both rails run the walk (promo, email, advance, total, stop-or-pay) in
// a kernel browser: kernel is the checkout engine here as a browser,
// not as a vault dependency. browserbase stays the join engine for
// meetings. the receipt is the same contract either way: every stop
// says why, masked data only, free or she never clicks pay.

import {
  assertLinkSafe,
} from "../link_safety.ts";
import { theUrlTell } from "../theurltell/mod.ts";
import { notifyOwner } from "../notify.ts";
import {
  CODE_SELECTORS,
  REDEEM_TEXTS,
} from "../promo.ts";
import {
  createKernelBrowser,
  kernelClickText,
  kernelElementExists,
  kernelFillInput,
  kernelJs,
  kernelPageInfo,
  kernelScreenshotB64,
  stopKernelBrowser,
} from "../kernel.ts";
import type { PaymentRail, CardPlacement, RailPick } from "./types.ts";
import { kernelRail } from "./kernel_rail.ts";
import { agentcardRail } from "./agentcard_rail.ts";

export type { VaultCheckoutReceipt } from "./types.ts";

// --- the money gates (pure) ---

// a total-shaped line reading $0.00 (or 0,00, or "total: free") is
// free. every total found must be zero. no readable total is NOT
// free: fail closed, she stops and reports rather than pays a guess.
const TOTAL_LINE =
  /(?:total|amount|due|charge|pay)[^.\n]{0,48}[:\s]?\$?\s*([0-9]+[.,][0-9]{2})/gi;

export function totalIsFree(pageText: string): boolean {
  const matches = [...pageText.matchAll(TOTAL_LINE)];
  if (matches.length === 0) {
    return /\btotal\b[^.\n]{0,40}\bfree\b|\bfree\b[^.\n]{0,40}\btotal\b/i.test(pageText);
  }
  return matches.every((m) => {
    const n = parseFloat(m[1].replace(",", "."));
    return n === 0;
  });
}

// the cap a card item / one-time card is bound to. the money rule
// already refuses to pay anything nonzero, so the cap exists for the
// one failure mode left: a mis-parsed page that charges anyway. the
// headroom (default $1, PAYMENT_HEADROOM_MINOR in minor units) covers
// the $0/$1 setup authorization merchants place on card entry, so the
// free checkout can succeed while the worst case stays one dollar.
export function capAmountMinor(totalFree: boolean): number {
  if (totalFree) {
    const headroom = parseInt(Deno.env.get("PAYMENT_HEADROOM_MINOR") || "100", 10);
    return Number.isFinite(headroom) && headroom > 0 ? Math.min(headroom, 500) : 100;
  }
  // a nonzero total never gets paid, so the cap on that path is one
  // dollar too: the card is only requested before the total is read
  // because some checkouts hide the total until a card exists
  return 100;
}

// pure: does this situation call for the handoff at all? the same
// gates as before: a checkout that detected a card, a promo code to
// apply (the vault exists for gateway-level promos, not shopping),
// and a checkout engine. a checkout with no promo code is still a
// hard stop.
export function vaultHandoffWanted(opts: {
  cc_detected: boolean;
  promoCode?: string | null;
  kernelConfigured: boolean;
}): boolean {
  return opts.cc_detected && Boolean(opts.promoCode) && opts.kernelConfigured;
}

// pure: which rail. explicit PAYMENT_RAIL wins (kernel | agentcard),
// else auto: kernel first (digits never through prixie beats instant),
// agentcard when the CLI is on PATH and logged in. neither: null and
// the handoff stops before it starts, with the reason in the receipt.
export function pickRail(
  configured: { kernel: boolean; agentcard: boolean },
  forced?: string,
): RailPick {
  if (forced === "kernel" || forced === "agentcard") {
    if (configured[forced]) return { rail: forced };
    return {
      rail: null,
      reason: `PAYMENT_RAIL is ${forced} but that rail is not configured`,
    };
  }
  if (configured.kernel) return { rail: "kernel" };
  if (configured.agentcard) return { rail: "agentcard" };
  return {
    rail: null,
    reason: "no payment rail configured: kernel needs KERNEL_API_KEY with a wallet, agentcard needs the CLI logged in",
  };
}

// --- the walk (shared by both rails) ---

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

export async function gatewayCheckout(
  url: string,
  promoCode: string,
  identity: { email: string; name?: string },
  rail: PaymentRail,
): Promise<import("./types.ts").VaultCheckoutReceipt> {
  const receipt: import("./types.ts").VaultCheckoutReceipt = {
    url,
    rail: rail.name,
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

  receipt.attempted = true;
  let browserId = "";
  try {
    const browser = await createKernelBrowser(tell.destination);
    browserId = browser.id;
    await sleep(4000); // let the page settle

    // promo first, same order as enterForm. a gateway-only promo has
    // no code field here, and that is expected, not a failure.
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

    // email: hers to enter, like every form
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

    // THE CARD MOMENT: the rail puts the card in. kernel: the vault
    // types it, digits never through prixie. agentcard: the one-time
    // card from the CLI is typed (the owner's carve-out, issued cards
    // only), and lives in process memory for exactly this typing.
    const info = await kernelPageInfo(browserId);
    const pageUrl = info?.url || tell.destination;
    const origin = new URL(pageUrl).origin;
    const capMinor = capAmountMinor(true); // the total is not read yet
    const placed: CardPlacement = await rail.putCardIn({
      browserId,
      pageUrl,
      origin,
      merchantHint: new URL(pageUrl).hostname,
      capMinor,
      currency: "usd",
      notifyApproval: async (a) => {
        receipt.approval_sent = true;
        receipt.approval_deadline_min = a.deadlineMin;
        return await notifyOwner({
          subject: "prixie: approve the checkout, one tap",
          body:
            `a gateway checkout at ${origin} needs your approval to finish.\n\n` +
            `what: a promo redemption, total must read $0.00 (she stops otherwise)\n` +
            `card: ${a.maskedLine}\n` +
            `approve here (valid ${a.deadlineMin} minutes): ${a.url}\n\n` +
            `if you do nothing, she stops and tells you. the card is never charged without the approval.`,
        });
      },
      receipt,
    });
    if (!placed.ok) {
      receipt.stopped_reason = placed.reason || `${rail.name} rail could not put the card in`;
      receipt.detail = receipt.stopped_reason;
      await kernelScreenshotB64(browserId).catch(() => "");
      return receipt;
    }
    receipt.vault_filled = true;
    receipt.card_masked = placed.maskedLast4;
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
      await rail.cleanup(placed, /* used */ false).catch(() => {});
      return receipt;
    }

    // free: complete it
    receipt.completed = await kernelClickText(browserId, PAY_TEXTS);
    await sleep(4000); // let the confirmation settle
    if (receipt.completed) {
      const after = await kernelPageInfo(browserId);
      receipt.detail = `checkout completed at a $0 total via the ${rail.name} rail${after ? ` (now: ${after.title})` : ""}`;
      await rail.cleanup(placed, /* used */ true).catch(() => {});
    } else {
      receipt.stopped_reason = "free total but no pay-shaped button found";
      receipt.detail = receipt.stopped_reason;
      await rail.cleanup(placed, /* used */ false).catch(() => {});
    }
    return receipt;
  } catch (err: any) {
    receipt.stopped_reason = `vault checkout errored: ${err.message}`;
    receipt.detail = receipt.stopped_reason;
    return receipt;
  } finally {
    // the browser dies the moment the payment portion is managed: nothing
    // of the checkout lingers on kernel's side
    if (browserId) await stopKernelBrowser(browserId).catch(() => {});
  }
}

// the entry form_entry has always called. picks the rail, runs the walk,
// returns the same receipt contract.
export async function vaultCheckout(
  url: string,
  promoCode: string,
  identity: { email: string; name?: string },
): Promise<import("./types.ts").VaultCheckoutReceipt> {
  const configured = {
    kernel: await kernelRail.configured(),
    agentcard: await agentcardRail.configured(),
  };
  const pick = pickRail(configured, Deno.env.get("PAYMENT_RAIL")?.toLowerCase());
  if (!pick.rail) {
    return {
      url,
      rail: "none",
      attempted: false,
      promo_applied: false,
      email_filled: false,
      vault_filled: false,
      total_read: "",
      total_free: false,
      completed: false,
      stopped_reason: pick.reason || "no payment rail configured",
      detail: pick.reason || "no payment rail configured",
    };
  }
  const rail = pick.rail === "kernel" ? kernelRail : agentcardRail;
  return await gatewayCheckout(url, promoCode, identity, rail);
}

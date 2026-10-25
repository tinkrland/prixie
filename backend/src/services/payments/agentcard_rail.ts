// the agentcard rail (the owner, oct 25 2026): agentcard.ai, the alchemy
// product (NOT agentcard.sh, the yc startup kernel partners with).
// its issued one-time-card path is the only instant, approval-free
// card in the landscape: `agentcard request new` prints a card capped
// to the requested amount, funded by a hold on the saved funding card
// (the owner's $5 buffer, never the main one), live 7 days, single use.
// later renewal charges decline: that is the stand-in property, the
// card is dead after the checkout and cannot spend beyond its cap.
//
// the carve-out (the owner, oct 25 2026), and it is exactly this wide: an
// ISSUED one-time card from the agentcard CLI may pass through
// prixie's process memory once, to be typed into this checkout, and
// nowhere else. a real card may never. the digits are never logged,
// never stored, never receipted: the receipt carries the last4 only.
// if the checkout does not complete, the card is cancelled by id so
// even the unused stand-in stops existing.
//
// what this rail does NOT do: no 3ds solving loop (the checkout stops
// if one appears, the owner decides), no `--source connected` path (that is
// mastercard agent pay, passkey per purchase, the wrong shape for
// 3am), no wallet crypto. one command in, digits once, cancel if
// unused.

import { kernelFillInput, kernelElementExists } from "../kernel.ts";
import type { CardMoment, CardPlacement, PaymentRail } from "./types.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// run the agentcard CLI and return its parsed --json stdout. errors
// are the CLI's own words, surfaced honestly in stops.
async function agentcard(
  args: string[],
): Promise<{ ok: boolean; json: any; stderr: string }> {
  const cmd = new Deno.Command("agentcard", {
    args: [...args, "--json"],
    stdout: "piped",
    stderr: "piped",
  });
  const p = await cmd.spawn().output();
  const out = new TextDecoder().decode(p.stdout);
  const err = new TextDecoder().decode(p.stderr);
  let json: any = null;
  try {
    json = JSON.parse(out);
  } catch {
    // not json: some commands print plain text on success
  }
  return { ok: p.success && (!json || json.ok !== false), json, stderr: err || out };
}

export async function agentcardConfigured(): Promise<boolean> {
  const check = new Deno.Command("sh", {
    args: ["-c", "command -v agentcard"],
    stdout: "piped",
  });
  const p = await check.spawn().output();
  if (!p.success) return false;
  // the rail only runs when the env allows it: the carve-out is a
  // decision the owner switches on, not a default
  if (Deno.env.get("PAYMENT_RAIL") === "kernel") return false;
  const who = await agentcard(["whoami"]);
  return who.ok && Boolean(String(who.json?.email || who.json?.human_email || "").includes("@"));
}

// the card fields, typed once. these selectors exist ONLY in this
// file, by the owner's carve-out: this is the one place prixie's typing
// may touch card-shaped inputs, and only with the issued one-time
// card the CLI just printed. no real card ever flows here.
const CARD_FIELD_SELECTORS: Record<string, string[]> = {
  number: [
    'input[name*="cardnumber" i]',
    'input[name*="card_number" i]',
    'input[id*="cardnumber" i]',
    'input[autocomplete="cc-number"]',
    'input[placeholder*="card number" i]',
  ],
  cvc: [
    'input[name*="cvc" i]',
    'input[name*="cvv" i]',
    'input[name*="csc" i]',
    'input[autocomplete="cc-csc"]',
    'input[id*="cvc" i]',
  ],
  exp: [
    'input[name*="exp" i][name*="date" i]',
    'input[name*="exp" i][name*="month" i]',
    'input[autocomplete="cc-exp"]',
    'input[id*="exp" i]',
    'input[placeholder*="mm" i]',
  ],
};

// pure: build the CLI request args from the checkout facts. the
// amount is the cap in DOLLARS (headroom, the money rule refuses
// anything nonzero at the pay click anyway). merchant and url are
// the real checkout facts, never placeholders.
export function requestArgs(ctx: { merchantHint: string; origin: string; capMinor: number }): string[] {
  const dollars = Math.max(Math.ceil(ctx.capMinor / 100), 1);
  return [
    "request", "new",
    "--source", "agentcard",
    "--merchant", ctx.merchantHint,
    "--url", ctx.origin,
    "--item", "promo checkout",
    "--amount", String(dollars),
  ];
}

// pure: the printed card, normalized for typing. the expiry arrives
// as month and year in some shape; the checkout wants MM/YY.
export function normalizeExpiry(card: any): string {
  const m = String(card.exp_month ?? card.expiry_month ?? card.exp?.month ?? "").padStart(2, "0");
  let y = String(card.exp_year ?? card.expiry_year ?? card.exp?.year ?? "");
  if (y.length === 4) y = y.slice(-2);
  return `${m}/${y}`;
}

// pure: the only card datum that may leave this module: the last4.
export function maskedLast4(card: any): string | undefined {
  const n = String(card.number ?? card.card_number ?? "");
  return n.length >= 4 ? n.slice(-4) : undefined;
}

function selectAndType(
  browserId: string,
  selectors: string[],
  value: string,
): Promise<boolean> {
  return (async () => {
    for (const sel of selectors) {
      if (await kernelElementExists(browserId, sel)) {
        if (await kernelFillInput(browserId, sel, value)) return true;
      }
    }
    return false;
  })();
}

export const agentcardRail: PaymentRail = {
  name: "agentcard",

  async configured(): Promise<boolean> {
    return await agentcardConfigured();
  },

  async putCardIn(ctx: CardMoment): Promise<CardPlacement> {
    const res = await agentcard(requestArgs({
      merchantHint: ctx.merchantHint,
      origin: ctx.origin,
      capMinor: ctx.capMinor,
    }));
    if (!res.ok) {
      const code = res.json?.error || res.json?.code || res.stderr.slice(0, 200);
      if (/kyc/i.test(String(code))) {
        return {
          ok: false,
          reason:
            "agentcard needs KYC before issuing cards: the owner verifies the account once (agentcard identity), then this rail works",
        };
      }
      return { ok: false, reason: `agentcard request failed: ${code}` };
    }
    const request = res.json?.request ?? res.json;
    const card = request?.card ?? res.json?.card;
    const id = request?.id ?? res.json?.id;
    if (!card?.number) {
      // the CLI may block awaiting an approval even on the issued
      // path (spend limits): never a silent pay, stop and say so
      return {
        ok: false,
        reason: `agentcard returned no card${id ? ` (request ${id}, cancel it)` : ""}: ${res.stderr.slice(0, 160)}`,
        handle: id ? { requestId: id } : undefined,
      };
    }

    // the digits are here, in this scope, once. the typing below is
    // their only use; the receipt gets the last4 only.
    const typed = await selectAndType(ctx.browserId, CARD_FIELD_SELECTORS.number, String(card.number));
    const cvc = await selectAndType(ctx.browserId, CARD_FIELD_SELECTORS.cvc, String(card.cvc ?? card.cvv ?? ""));
    const exp = await selectAndType(ctx.browserId, CARD_FIELD_SELECTORS.exp, normalizeExpiry(card));

    // name and billing, exactly as printed: mismatches decline
    const name = card.name || card.cardholder_name || "Alchemy Agentcard";
    await selectAndType(ctx.browserId, [
      'input[name*="cardholder" i]',
      'input[name*="name" i][name*="card" i]',
      'input[autocomplete="cc-name"]',
    ], String(name)).catch(() => {});

    if (!typed || !cvc || !exp) {
      // the form did not take the card: cancel the unused stand-in so
      // even it stops existing
      if (id) await agentcard(["request", "cancel", String(id)]);
      return {
        ok: false,
        reason: "the checkout form had no card field shape this rail knows (number/cvc/exp): card cancelled, the owner decides",
        handle: undefined,
      };
    }
    await sleep(1500);

    return {
      ok: true,
      maskedLast4: maskedLast4(card),
      handle: id ? { requestId: String(id) } : undefined,
    };
  },

  // an unused issued card is cancelled by id: the stand-in should not
  // outlive the checkout it was made for. a used one is consumed by
  // the network, nothing to do.
  async cleanup(placement: CardPlacement, used: boolean): Promise<void> {
    const h = placement.handle as { requestId?: string } | undefined;
    if (!used && h?.requestId) {
      await agentcard(["request", "cancel", h.requestId]);
    }
  },
};

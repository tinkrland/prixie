// the kernel rail (the owner, oct 25 2026): kernel's documented payment
// model, which is not a pre-enrolled card but a wallet plus one card
// item per purchase. the wallet item is the persistent thing (the owner
// connects the buffer card once through kernel's hosted flow, the $5
// one, never the main one). the card item is ephemeral: created for
// this checkout, bound to the checkout origin (fill works on that
// origin and nowhere else), an amount cap in minor units, a currency,
// and consumed at first use. kernel's fill types it in: digits pass
// vault -> page and never through prixie, who only ever holds kernel's
// masked last4.
//
// the honest limit of this rail (research, oct 25 2026): every kernel
// wallet provider (link, agentcard.sh) requires a human approval per
// purchase, even at a $0 total. so when kernel returns an approval
// action, the rail emails the owner the link (the link is the owner's, never the
// receipt's) and parks until the card item is ready or the deadline
// passes. no approval, no payment: fail closed, never a silent retry.
//
// the item creation, authorize, and delete calls follow kernel's
// documented shapes (payments on kernel + agentcard integration, oct
// 25 2026). like the vault fill before them, they are kernel-documented
// and not yet exercised against a live gateway: the owner's wallet is not
// enrolled yet, so the rail stops at "no wallet configured" until she
// connects the buffer card and sets KERNEL_VAULT.

import { kernelAuth, KERNEL_BASE, kernelVaultFill, listVaultNames } from "../kernel.ts";
import type { CardMoment, CardPlacement, PaymentRail } from "./types.ts";

// find the wallet: kernel's model is ONE wallet item per provider
// (link or agentcard), connected once. env KERNEL_VAULT names the
// vault; inside it the wallet item is the persistent payment method.
export async function findKernelWallet(
  vaultName: string,
): Promise<{ vault: string; key: string; provider: string; masked?: string } | null> {
  const res = await fetch(`${KERNEL_BASE}/vaults/${vaultName}/items`, {
    headers: { "Authorization": kernelAuth() },
  });
  if (!res.ok) return null;
  const items = await res.json();
  const arr = Array.isArray(items) ? items : (items.items || []);
  const wallet = arr.find((it: any) => (it.type || "").toLowerCase() === "wallet");
  if (!wallet) return null;
  return {
    vault: vaultName,
    key: wallet.key,
    provider: wallet.spec?.provider || wallet.state?.provider || "link",
    masked: wallet.state?.masks?.last4 || wallet.state?.last4_masked || undefined,
  };
}

// pure: the card item spec kernel documents, from the checkout facts.
// merchant is the checkout origin (kernel binds fill to that origin),
// amount is the cap in minor units.
export function cardItemSpec(ctx: {
  origin: string;
  capMinor: number;
  currency: string;
  provider: string;
}): Record<string, unknown> {
  return {
    type: "card",
    spec: {
      provider: ctx.provider,
      wallet: "auto", // resolved by kernel against the vault's wallet item
      merchant_url: ctx.origin,
      amount: ctx.capMinor,
      currency: ctx.currency,
    },
  };
}

// create the ephemeral card item for this checkout. one checkout, one
// item, named for the moment; deleted after, consumed or not.
async function createCardItem(
  vault: string,
  name: string,
  spec: Record<string, unknown>,
): Promise<{ key: string } | null> {
  const res = await fetch(`${KERNEL_BASE}/vaults/${vault}/items/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
    body: JSON.stringify(spec),
  });
  if (!res.ok) return null;
  const item = await res.json();
  return item?.key ? { key: item.key } : null;
}

async function deleteCardItem(vault: string, key: string): Promise<void> {
  await fetch(`${KERNEL_BASE}/vaults/${vault}/items/${key}`, {
    method: "DELETE",
    headers: { "Authorization": kernelAuth() },
  }).catch(() => {});
}

// the card item's live state: status (requested -> ready -> consumed)
// and, when kernel wants a human, the approval action.
async function cardItemState(
  vault: string,
  key: string,
): Promise<{ status: string; approvalUrl?: string; maskedLast4?: string } | null> {
  const res = await fetch(`${KERNEL_BASE}/vaults/${vault}/items/${key}`, {
    headers: { "Authorization": kernelAuth() },
  });
  if (!res.ok) return null;
  const item = await res.json();
  const action = item.action || {};
  return {
    status: item.state?.status || "unknown",
    approvalUrl:
      action.name === "spend_approval" || action.name === "push_approval"
        ? action.url
        : undefined,
    maskedLast4: item.state?.masks?.last4 || item.state?.last4_masked || undefined,
  };
}

// authorize the card item against this browser + checkout page. per
// kernel's docs: require `authorize` in available_operations and
// invoke it with the browser_id and the checkout's exact current url;
// kernel inspects the checkout and picks the credential form.
async function authorizeCardItem(
  vault: string,
  key: string,
  browserId: string,
  pageUrl: string,
): Promise<boolean> {
  const res = await fetch(
    `${KERNEL_BASE}/vaults/${vault}/items/${key}/operations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": kernelAuth() },
      body: JSON.stringify({
        type: "authorize",
        browser_id: browserId,
        page_url: pageUrl,
      }),
    },
  );
  return res.ok;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// park for the owner's approval: email the link, poll the item until ready,
// give up at the deadline. she is the only approver there is.
async function awaitApproval(
  ctx: CardMoment,
  vault: string,
  key: string,
  maskedLine: string,
): Promise<{ ok: boolean; reason?: string }> {
  const deadlineMin = parseInt(Deno.env.get("KERNEL_APPROVAL_WAIT_MIN") || "10", 10);
  const deadline = Date.now() + deadlineMin * 60_000;
  let emailed = false;
  while (Date.now() < deadline) {
    const state = await cardItemState(vault, key);
    if (!state) return { ok: false, reason: "card item vanished while waiting for approval" };
    if (state.status === "ready") return { ok: true };
    if (state.approvalUrl && !emailed) {
      emailed = true;
      const sent = await ctx.notifyApproval({
        url: state.approvalUrl,
        maskedLine,
        deadlineMin,
      });
      if (!sent) {
        return { ok: false, reason: "approval link could not be emailed: stopping, never a silent pay" };
      }
    }
    await sleep(5000);
  }
  return { ok: false, reason: `approval did not arrive within ${deadlineMin} minutes: she stopped, the card was not charged` };
}

export const kernelRail: PaymentRail = {
  name: "kernel",

  // configured = kernel key + a vault holding a wallet item. without
  // the owner's wallet enrolled, the rail says so and stops: never a
  // silent attempt.
  async configured(): Promise<boolean> {
    if (!Deno.env.get("KERNEL_API_KEY")) return false;
    const envVault = Deno.env.get("KERNEL_VAULT");
    const vaults = envVault ? [envVault, ...await listVaultNames()] : await listVaultNames();
    for (const v of [...new Set(vaults)]) {
      if (await findKernelWallet(v)) return true;
    }
    return false;
  },

  async putCardIn(ctx: CardMoment): Promise<CardPlacement> {
    const envVault = Deno.env.get("KERNEL_VAULT");
    const vaults = envVault ? [envVault, ...await listVaultNames()] : await listVaultNames();
    let wallet: Awaited<ReturnType<typeof findKernelWallet>> = null;
    for (const v of [...new Set(vaults)]) {
      wallet = await findKernelWallet(v);
      if (wallet) break;
    }
    if (!wallet) {
      return {
        ok: false,
        reason:
          "no kernel wallet configured: the owner's buffer card is not enrolled (connect it once via kernel's hosted flow, set KERNEL_VAULT)",
      };
    }
    const provider = Deno.env.get("KERNEL_CARD_PROVIDER")?.toLowerCase() || wallet.provider;

    const itemName = `prixie-checkout-${Date.now()}`;
    const spec = cardItemSpec({
      origin: ctx.origin,
      capMinor: ctx.capMinor,
      currency: ctx.currency,
      provider,
    });
    const item = await createCardItem(wallet.vault, itemName, spec);
    if (!item) {
      return { ok: false, reason: "kernel card item creation failed (origin or amount binding rejected)" };
    }

    const authorized = await authorizeCardItem(
      wallet.vault,
      item.key,
      ctx.browserId,
      ctx.pageUrl,
    );
    if (!authorized) {
      await deleteCardItem(wallet.vault, item.key);
      return { ok: false, reason: "kernel authorize failed: the checkout page or origin was not accepted" };
    }

    // wait for ready, parking for the owner's approval if kernel asks
    const waitMs = (parseInt(Deno.env.get("KERNEL_APPROVAL_WAIT_MIN") || "10", 10) * 60_000);
    const deadline = Date.now() + waitMs;
    let masked: string | undefined;
    while (Date.now() < deadline) {
      const state = await cardItemState(wallet.vault, item.key);
      if (!state) break;
      masked = state.maskedLast4;
      if (state.status === "ready") break;
      if (state.approvalUrl) {
        const approval = await awaitApproval(
          ctx,
          wallet.vault,
          item.key,
          `kernel ${provider} card${masked ? ` ending ${masked}` : ""}`,
        );
        if (!approval.ok) {
          await deleteCardItem(wallet.vault, item.key);
          return { ok: false, reason: approval.reason, maskedLast4: masked };
        }
        break;
      }
      await sleep(4000);
    }
    const final = await cardItemState(wallet.vault, item.key);
    if (!final || final.status !== "ready") {
      await deleteCardItem(wallet.vault, item.key);
      return {
        ok: false,
        reason: `kernel card item never became ready (${final?.status || "unknown"}): no card was put in`,
      };
    }

    // THE HANDOFF MOMENT: kernel's fill types the card into the page
    // open in this browser. the digits pass vault -> page, never
    // through prixie.
    const fill = await kernelVaultFill(wallet.vault, item.key, ctx.browserId, ctx.pageUrl);
    return {
      ok: fill.ok,
      reason: fill.ok ? undefined : fill.detail,
      maskedLast4: final.maskedLast4,
      handle: { vault: wallet.vault, key: item.key },
    };
  },

  // one card item per checkout: it is deleted after, consumed or not.
  // nothing of the purchase lingers in the vault.
  async cleanup(placement: CardPlacement, used: boolean): Promise<void> {
    const h = placement.handle as { vault: string; key: string } | undefined;
    if (!h) return;
    await deleteCardItem(h.vault, h.key);
  },
};

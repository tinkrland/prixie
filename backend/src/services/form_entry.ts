// form entry: the "enter an email or smth" primitive. attendance forms,
// webinar signups, and first-come-first-served code redemption are the
// same action: open a page in her own session, act on it, keep the
// receipts. it is never done in the meeting session: navigating that
// away would drop the meeting.
//
// identity (the owner, oct 21 2026): the address that enters a form is chosen
// per context by form_email.ts (regular / plus-tagged / disposable /
// business), and it is never the owner's. the owner's email is only
// ever the destination she reports TO, never who she acts AS.
//
// order of operations matters: redeem / promo-code buttons often live
// OUTSIDE the checkout flow entirely, so the code step runs before the
// email fill, and the no-cc gate only governs forms she would fill.

import { alignNewsletterBoxes } from "./consent.ts";
import {
  createSession,
  elementExists,
  findAndClickByText,
  findAndType,
  navigateTo,
} from "./browserbase.ts";
import { notifyOwner } from "./notify.ts";
import { captureScreenshot } from "./screenshots.ts";
import { registerDefaultScreenshotEngines } from "./screenshot_engines.ts";
import { CODE_SELECTORS, REDEEM_TEXTS } from "./promo.ts";
import { assertLinkSafe } from "./link_safety.ts";
import { theUrlTell } from "./theurltell/mod.ts";
import {
  type VaultCheckoutReceipt,
  vaultCheckout,
  vaultHandoffWanted,
} from "./vault_checkout.ts";
import { kernelConfigured } from "./kernel.ts";

// engines are idempotent to register; this keeps form_entry honest even
// if it runs before the realtime webhook module ever loads
registerDefaultScreenshotEngines();

export interface FormIdentity {
  email: string;
  name?: string;
}

export interface FormEntryReceipt {
  url: string;
  submitted: boolean;
  filled_email: boolean;
  filled_name: boolean;
  promo_attempted: boolean;
  promo_applied: boolean;
  cc_detected: boolean;
  // opt-in boxes that were pre-checked and got unchecked (the owner, oct
  // 22 2026: she never opts in, and a pre-checked box is the site's
  // yes, not hers). unchecked opt-ins stay unchecked and are not counted.
  newsletters_cleared?: number;
  // opt-out boxes she ticked (tick to NOT be added to the list): the
  // signup needs the real email, so she takes the out the form offers
  newsletter_opt_outs?: number;
  before_screenshot?: string;
  after_screenshot?: string;
  detail: string;
}

// pure: the notify email for a redemption attempt, so the owner can
// verify what she did or do it themselves when she (correctly) did not
export function buildRedeemEmail(
  receipt: FormEntryReceipt,
  context: {
    meetingTitle: string;
    captureTitle: string;
    scarce?: string;
    expiry?: string;
    formEmail?: string;
    promoCode?: string | null;
    vault?: VaultCheckoutReceipt;
  },
): { subject: string; body: string } {
  const lines = [
    `redeem attempt for "${context.captureTitle}" in ${context.meetingTitle}`,
    `form: ${receipt.url}`,
    "",
  ];
  if (context.scarce) {
    lines.push(`scarcity heard mid-meeting: ${context.scarce}`, "");
  }
  if (context.expiry) {
    lines.push(context.expiry, "");
  }
  if (context.promoCode) {
    lines.push(receipt.promo_applied
      ? `promo code ${context.promoCode}: applied`
      : `promo code ${context.promoCode}: she looked for a redeem button but ${receipt.promo_attempted ? "could not enter it" : "did not find one"}`);
  }
  if (receipt.cc_detected) {
    if (context.vault?.attempted) {
      // the kernel handoff story (the owner, oct 25 2026): the card portion
      // was kernel's vault, the rest was her. the receipt is the proof.
      lines.push("", "the card portion went through kernel's vault (the owner, oct 25 2026).");
      lines.push(
        "she never saw or typed a card number: kernel's vault fill put the buffer card in, and the kernel browser was deleted the moment the payment portion was managed.",
      );
      lines.push(
        `promo code: ${context.vault.promo_applied ? "applied on the page" : "no code field on the page (a gateway-level promo applies inside the checkout itself)"}`,
      );
      if (context.vault.completed) {
        lines.push("the checkout completed at a $0 total: nothing was spent.");
      } else {
        lines.push("she did NOT complete it: " + (context.vault.stopped_reason || "unknown reason"));
      }
      if (context.vault.card_masked) {
        lines.push(`vault card (masked by kernel, digits never read): **** ${context.vault.card_masked}`);
      }
      if (context.vault.total_read) {
        lines.push("the page showed: " + context.vault.total_read.replace(/\n/g, " | ").slice(0, 200));
      }
    } else {
      lines.push("she stopped at the checkout: the form asks for payment/card details.");
      lines.push("no-cc only by design, she does not spend money on your behalf.");
      if (context.vault && !context.vault.attempted && context.vault.stopped_reason) {
        lines.push("vault handoff not attempted: " + context.vault.stopped_reason);
      }
      lines.push("if you want it anyway, do it now: " + receipt.url);
    }
  } else if (receipt.submitted) {
    lines.push(`she entered ${context.formEmail || "her form email"} and submitted.`);
    lines.push("check that inbox if the form sends a confirmation or code.");
    lines.push("before: " + (receipt.before_screenshot || "(no screenshot)"));
    lines.push("after: " + (receipt.after_screenshot || "(no screenshot)"));
  } else if (receipt.detail.startsWith("link blocked")) {
    lines.push("she did NOT visit this link: " + receipt.detail);
    lines.push("review it yourself before touching it: " + receipt.url);
  } else {
    lines.push("she could NOT complete the form: " + receipt.detail);
    lines.push("if it is first come first serve, do it now: " + receipt.url);
  }
  return {
    subject: receipt.cc_detected
      ? context.vault?.completed
        ? `prixie: redeemed "${context.captureTitle}" via kernel vault (${context.meetingTitle})`
        : context.vault?.attempted
        ? `prixie: vault checkout stopped, act now (${context.meetingTitle})`
        : `prixie: payment form, did NOT redeem "${context.captureTitle}" (${context.meetingTitle})`
      : receipt.submitted
      ? `prixie: redeemed "${context.captureTitle}" (${context.meetingTitle})`
      : `prixie: could NOT redeem "${context.captureTitle}", act now (${context.meetingTitle})`,
    body: lines.join("\n"),
  };
}

const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name*="email" i]',
  'input[placeholder*="email" i]',
  'input[id*="email" i]',
];

const NAME_SELECTORS = [
  'input[name*="name" i]',
  'input[placeholder*="name" i]',
  'input[id*="name" i]',
];

const SUBMIT_TEXTS = ["submit", "sign up", "signup", "register", "rsvp", "join", "claim", "enter", "get code", "get access", "redeem", "go", "continue"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// the promo-code step: find the redeem button (often on the landing
// page, far from any checkout), open the code field, type the code.
// returns true only if the code landed somewhere.
async function tryApplyPromo(
  sessionId: string,
  code: string,
): Promise<{ attempted: boolean; applied: boolean; detail: string }> {
  const opened = await findAndClickByText(
    sessionId,
    REDEEM_TEXTS,
    "button, a, summary, div[role='button'], span[role='button']",
    6000,
  );
  if (!opened) {
    return { attempted: false, applied: false, detail: "no redeem button found" };
  }
  await sleep(1500); // let the code ui reveal itself

  for (const sel of CODE_SELECTORS) {
    if (await findAndType(sessionId, sel, code, 3000)) {
      // the code field often carries its own apply/redeem right beside it
      await findAndClickByText(
        sessionId,
        ["apply", "redeem", "submit", "go"],
        "button, input[type='submit'], div[role='button']",
        3000,
      );
      return { attempted: true, applied: true, detail: `code ${code} entered` };
    }
  }
  return { attempted: true, applied: false, detail: "redeem button opened but no code field appeared" };
}

// flowing forms (the owner, oct 22 2026): typeform and surveymonkey advance
// one screen at a time, and a single-page fill would answer screen
// one and stop. these engines get a per-screen loop instead: fill
// what is on the screen, then click the submit-shaped button when
// one exists (that screen is the last), the next-shaped one when it
// does not, and stop honestly at a screen with neither. max 15
// screens, because a survey that long is not a form, it is a career.
const FLOWING_HOSTS = ["typeform.com", "surveymonkey.com"];
const FLOW_SUBMIT_TEXTS = ["submit", "done", "complete", "finish", "submit response", "submit form", "see results", "get results"];
const FLOW_ADVANCE_TEXTS = ["next", "continue", "ok", "arrow", "forward", "next page"];
const MAX_FLOW_SCREENS = 15;

// pure: is this url a one-screen-at-a-time engine?
export function isFlowingForm(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return FLOWING_HOSTS.some((f) => host === f || host.endsWith("." + f));
  } catch {
    return false;
  }
}

// pure: the precedence rule for one screen. submit-shaped wins over
// next-shaped (a screen with both is the last screen), and a screen
// with neither is where the truth stops.
export function flowActionFor(buttonTexts: string[]): { act: "submit" | "advance" | "stuck" } {
  const labels = buttonTexts.map((t) => t.toLowerCase());
  if (labels.some((l) => FLOW_SUBMIT_TEXTS.some((t) => l === t || l.includes(t)))) {
    return { act: "submit" };
  }
  if (labels.some((l) => FLOW_ADVANCE_TEXTS.some((t) => l === t || l.includes(t)))) {
    return { act: "advance" };
  }
  return { act: "stuck" };
}

// best-effort generic form act. the contract is a receipt, not a
// promise: submitted=true means a submit-shaped click happened after
// the email landed. the screenshots are the proof.
export async function enterForm(
  url: string,
  identity: FormIdentity,
  opts?: { promo_code?: string | null },
): Promise<FormEntryReceipt> {
  const receipt: FormEntryReceipt = {
    url,
    submitted: false,
    filled_email: false,
    filled_name: false,
    promo_attempted: false,
    promo_applied: false,
    cc_detected: false,
    detail: "",
  };

  // the tell comes before the session exists (the owner, oct 22 2026):
  // people pad links with shorteners and trackers, and she does not
  // ask wheregoes.com or any third party where it goes. theurltell
  // walks the chain itself, and only the destination is ever opened.
  // an unsafe link is never even loaded in a throwaway browser.
  const tell = await theUrlTell(url);
  if (!tell.destination) {
    receipt.detail = `link not opened: ${tell.reason}`;
    return receipt;
  }
  // the full gate runs on the destination: that is the only url a
  // session ever opens, so that is the url the safe browsing layer
  // needs to judge
  const verdict = await assertLinkSafe(tell.destination);
  if (!verdict.safe) {
    receipt.detail = `link blocked by safety gate: ${verdict.reason}`;
    return receipt;
  }
  if (tell.chain.length > 1) {
    const dest = new URL(tell.destination);
    receipt.detail += `link told through ${tell.chain.length - 1} hop(s) to ${dest.hostname}; `;
  }

  const session = await createSession();

  // a one-screen-at-a-time engine never sees the single-page fill:
  // the flow loop owns it, screen by screen
  if (isFlowingForm(tell.destination)) {
    return await enterFlowingForm(session.id, tell.destination, identity, receipt);
  }

  try {
    await navigateTo(session.id, tell.destination); // consent banners are dismissed here
    await sleep(4000); // let the page settle

    // the newsletter rule (the owner, oct 22 2026): opt-in boxes are never
    // hers (a pre-checked one is the site's yes, not hers, and gets
    // unchecked); opt-out boxes (tick to NOT be added) are always
    // hers, and she ticks them.
    const aligned = await alignNewsletterBoxes(session.id);
    receipt.newsletters_cleared = aligned.optInsUnchecked;
    receipt.newsletter_opt_outs = aligned.optOutsChecked;

    // promo/redeem first: the button often exists outside the entire
    // checkout flow, and applying the code may be all she needs to do
    if (opts?.promo_code) {
      const promo = await tryApplyPromo(session.id, opts.promo_code);
      receipt.promo_attempted = promo.attempted;
      receipt.promo_applied = promo.applied;
      if (!promo.attempted) {
        receipt.detail += "no redeem button on the page; ";
      }
    }

    // the no-cc gate, probed before a single identity field is touched.
    // a code already applied is not undone by walking away.
    for (const sel of ["input[autocomplete*='cc' i]", 'input[name*="card" i][type!="email"]', 'input[id*="card" i][type!="email"]', 'input[placeholder*="card" i]', 'input[name*="cvc" i]', 'input[name*="cvv" i]', 'input[name*="csc" i]']) {
      if (await elementExists(session.id, sel, 2500)) {
        receipt.cc_detected = true;
        receipt.detail = "credit card / payment field detected, not filling";
        receipt.before_screenshot = await captureScreenshot(session.id, "browserbase");
        return receipt;
      }
    }

    for (const sel of EMAIL_SELECTORS) {
      if (await findAndType(session.id, sel, identity.email, 4000)) {
        receipt.filled_email = true;
        break;
      }
    }

    if (!receipt.filled_email) {
      receipt.detail = (receipt.detail || "") + "no email field found on the page";
      receipt.before_screenshot = await captureScreenshot(session.id, "browserbase");
      return receipt;
    }

    if (identity.name) {
      for (const sel of NAME_SELECTORS) {
        if (await findAndType(session.id, sel, identity.name, 3000)) {
          receipt.filled_name = true;
          break;
        }
      }
    }

    receipt.before_screenshot = await captureScreenshot(session.id, "browserbase");

    const clicked = await findAndClickByText(
      session.id,
      SUBMIT_TEXTS,
      "button, input[type='submit'], a[role='button'], div[role='button']",
      8000,
    );
    receipt.submitted = clicked;
    receipt.detail = (receipt.detail || "") + (clicked ? "submitted" : "found the form but no submit-shaped button");

    if (!clicked) {
      // last resort: input[type=submit] without text
      receipt.submitted = await findAndClickByText(
        session.id,
        ["submit"],
        "input[type='submit']",
        2000,
      );
      if (receipt.submitted) receipt.detail += " (via input[type=submit])";
    }

    await sleep(3000); // let the result settle
    receipt.after_screenshot = await captureScreenshot(session.id, "browserbase");
    return receipt;
  } catch (err: any) {
    receipt.detail = `form entry errored: ${err.message}`;
    return receipt;
  }
}

// redeem a link and push the receipt. fire-and-forget by contract: the
// capture stays the record of truth in supabase.
export async function redeemAndNotify(
  url: string,
  context: {
    meetingTitle: string;
    captureTitle: string;
    scarce?: string;
    expiry?: string;
    promoCode?: string | null;
    emailMode?: import("./form_email.ts").FormEmailMode | null;
  },
): Promise<boolean> {
  const { chooseFormEmail } = await import("./form_email.ts");
  const formEmail = await chooseFormEmail(context.emailMode ?? null, url);
  if (!formEmail) {
    console.warn("prixie: redeem skipped, no form email configured (set PRIXIE_FORM_EMAIL)");
    return false;
  }

  const receipt = await enterForm(
    url,
    { email: formEmail.address, name: Deno.env.get("PRIXIE_FORM_NAME") || "prixie" },
    { promo_code: context.promoCode },
  );

  // the gateway-promo case (the owner, oct 25 2026): a checkout that demands
  // a card just to APPLY the code hands the card portion to kernel's
  // vault. she still never touches a card; the money rule holds: only
  // a $0 total completes.
  let vault: VaultCheckoutReceipt | undefined;
  if (
    vaultHandoffWanted({
      cc_detected: receipt.cc_detected,
      promoCode: context.promoCode,
      kernelConfigured: kernelConfigured(),
    })
  ) {
    vault = await vaultCheckout(url, context.promoCode!, {
      email: formEmail.address,
      name: Deno.env.get("PRIXIE_FORM_NAME") || "prixie",
    });
  }

  const email = buildRedeemEmail(receipt, {
    ...context,
    formEmail: formEmail.address,
    promoCode: context.promoCode,
    vault,
  });
  return await notifyOwner(email);
}

// the flow loop: one screen at a time, fill then advance, submit when
// the button is submit-shaped. the receipt is the same contract as
// the single-page fill: submitted means a submit-shaped click, the
// screenshots are the proof, and a screen she cannot pass is told,
// never pretended past.
async function enterFlowingForm(
  sessionId: string,
  url: string,
  identity: FormIdentity,
  receipt: FormEntryReceipt,
): Promise<FormEntryReceipt> {
  await navigateTo(sessionId, url); // consent banners are dismissed here
  await sleep(4000);

  for (let screen = 1; screen <= MAX_FLOW_SCREENS; screen++) {
    // fill what is on THIS screen
    if (identity.email && !receipt.filled_email) {
      for (const sel of EMAIL_SELECTORS) {
        if (await findAndType(sessionId, sel, identity.email, 3000)) {
          receipt.filled_email = true;
          break;
        }
      }
    }
    if (identity.name && !receipt.filled_name) {
      for (const sel of NAME_SELECTORS) {
        if (await findAndType(sessionId, sel, identity.name, 3000)) {
          receipt.filled_name = true;
          break;
        }
      }
    }

    // the newsletter rule rides every screen, not just the first
    const aligned = await alignNewsletterBoxes(sessionId);
    receipt.newsletters_cleared = (receipt.newsletters_cleared ?? 0) + aligned.optInsUnchecked;
    receipt.newsletter_opt_outs = (receipt.newsletter_opt_outs ?? 0) + aligned.optOutsChecked;

    // the no-cc gate, probed per screen
    for (const sel of ["input[autocomplete*='cc' i]", 'input[name*="card" i][type!="email"]', 'input[id*="card" i][type!="email"]', 'input[placeholder*="card" i]', 'input[name*="cvc" i]', 'input[name*="cvv" i]', 'input[name*="csc" i]']) {
      if (await elementExists(sessionId, sel, 2500)) {
        receipt.cc_detected = true;
        receipt.detail = `cc field on screen ${screen}, she stopped there`;
        return receipt;
      }
    }

    if (screen === 1) receipt.before_screenshot = await captureScreenshot(sessionId, "browserbase");

    // submit-shaped wins (flowActionFor's precedence, in the dom):
    // a screen with both next and submit is the last screen
    const submitted = await findAndClickByText(
      sessionId,
      FLOW_SUBMIT_TEXTS,
      "button, input[type='submit'], a[role='button'], div[role='button']",
      8000,
    );
    if (submitted) {
      receipt.submitted = true;
      receipt.detail += `flowed through ${screen} screen(s), submitted`;
      break;
    }

    const advanced = await findAndClickByText(
      sessionId,
      FLOW_ADVANCE_TEXTS,
      "button, a[role='button'], div[role='button']",
      8000,
    );
    if (!advanced) {
      receipt.detail += `stopped at screen ${screen}: no submit- or next-shaped button`;
      break;
    }
    await sleep(3000); // let the next screen render
  }

  await sleep(3000); // let the result settle
  receipt.after_screenshot = await captureScreenshot(sessionId, "browserbase");
  return receipt;
}

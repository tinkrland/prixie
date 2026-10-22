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

import { uncheckNewsletterOptIns } from "./consent.ts";
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
  // marketing boxes that were pre-checked and got unchecked (the owner, oct
  // 22 2026: she never opts in, and a pre-checked box is the site's
  // yes, not hers). unchecked boxes stay unchecked and are not counted.
  newsletters_cleared?: number;
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
    formEmail?: string;
    promoCode?: string | null;
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
  if (context.promoCode) {
    lines.push(receipt.promo_applied
      ? `promo code ${context.promoCode}: applied`
      : `promo code ${context.promoCode}: she looked for a redeem button but ${receipt.promo_attempted ? "could not enter it" : "did not find one"}`);
  }
  if (receipt.cc_detected) {
    lines.push("she stopped at the checkout: the form asks for payment/card details.");
    lines.push("no-cc only by design, she does not spend money on your behalf.");
    lines.push("if you want it anyway, do it now: " + receipt.url);
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
      ? `prixie: payment form, did NOT redeem "${context.captureTitle}" (${context.meetingTitle})`
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

  // the gate comes before the session exists: an unsafe link is never
  // even loaded in a throwaway browser
  const verdict = await assertLinkSafe(url);
  if (!verdict.safe) {
    receipt.detail = `link blocked by safety gate: ${verdict.reason}`;
    return receipt;
  }

  const session = await createSession();

  try {
    await navigateTo(session.id, url); // consent banners are dismissed here
    await sleep(4000); // let the page settle

    // the newsletter rule (the owner, oct 22 2026): pre-checked marketing
    // boxes are unchecked before anything is filled. she never opts in.
    receipt.newsletters_cleared = await uncheckNewsletterOptIns(session.id);

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
  const email = buildRedeemEmail(receipt, {
    ...context,
    formEmail: formEmail.address,
    promoCode: context.promoCode,
  });
  return await notifyOwner(email);
}

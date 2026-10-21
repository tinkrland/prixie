// form entry: the "enter an email or smth" primitive. attendance forms,
// webinar signups, and first-come-first-served code redemption are the
// same action: open a page in her own session, fill it with the owner's
// identity, submit, and keep the receipts. it is never done in the
// meeting session: navigating that away would drop the meeting.

import {
  createSession,
  findAndClickByText,
  findAndType,
  navigateTo,
} from "./browserbase.ts";
import { notifyOwner } from "./notify.ts";
import { captureScreenshot } from "./screenshots.ts";
import { registerDefaultScreenshotEngines } from "./screenshot_engines.ts";

// engines are idempotent to register; this keeps form_entry honest even
// if it runs before the realtime webhook module ever loads
registerDefaultScreenshotEngines();

export interface OwnerIdentity {
  email: string;
  name?: string;
}

export interface FormEntryReceipt {
  url: string;
  submitted: boolean;
  filled_email: boolean;
  filled_name: boolean;
  before_screenshot?: string;
  after_screenshot?: string;
  detail: string;
}

export function getOwnerIdentity(): OwnerIdentity | null {
  const email = Deno.env.get("PRIXIE_OWNER_EMAIL");
  if (!email) return null;
  return { email, name: Deno.env.get("PRIXIE_OWNER_NAME") || undefined };
}

// pure: the notify email for a redemption attempt, so the owner can
// verify what she did on their behalf or do it themselves if she failed
export function buildRedeemEmail(
  receipt: FormEntryReceipt,
  context: { meetingTitle: string; captureTitle: string; scarce?: string },
): { subject: string; body: string } {
  const lines = [
    `redeem attempt for "${context.captureTitle}" in ${context.meetingTitle}`,
    `form: ${receipt.url}`,
    "",
  ];
  if (context.scarce) {
    lines.push(`scarcity heard mid-meeting: ${context.scarce}`, "");
  }
  if (receipt.submitted) {
    lines.push("she entered your details and submitted the form.");
    lines.push("before: " + (receipt.before_screenshot || "(no screenshot)"));
    lines.push("after: " + (receipt.after_screenshot || "(no screenshot)"));
  } else {
    lines.push("she could NOT complete the form: " + receipt.detail);
    lines.push("if it is first come first serve, do it now: " + receipt.url);
  }
  return {
    subject: receipt.submitted
      ? `prixie: redeemed "${context.captureTitle}" for you (${context.meetingTitle})`
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

// best-effort generic form fill. forms vary wildly, so the contract is a
// receipt, not a promise: submitted=true means a submit-shaped click
// happened after the email landed. the screenshots are the proof.
export async function enterForm(
  url: string,
  identity: OwnerIdentity,
): Promise<FormEntryReceipt> {
  const session = await createSession();
  const receipt: FormEntryReceipt = {
    url,
    submitted: false,
    filled_email: false,
    filled_name: false,
    detail: "",
  };

  try {
    await navigateTo(session.id, url);
    await new Promise((r) => setTimeout(r, 4000)); // let the form settle

    for (const sel of EMAIL_SELECTORS) {
      if (await findAndType(session.id, sel, identity.email, 4000)) {
        receipt.filled_email = true;
        break;
      }
    }

    if (!receipt.filled_email) {
      receipt.detail = "no email field found on the page";
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
    receipt.detail = clicked ? "submitted" : "found the form but no submit-shaped button";

    if (!clicked) {
      // last resort: input[type=submit] without text
      receipt.submitted = await findAndClickByText(
        session.id,
        ["submit"],
        "input[type='submit']",
        2000,
      );
      if (receipt.submitted) receipt.detail = "submitted via input[type=submit]";
    }

    await new Promise((r) => setTimeout(r, 3000)); // let the result settle
    receipt.after_screenshot = await captureScreenshot(session.id, "browserbase");
    return receipt;
  } catch (err: any) {
    receipt.detail = `form entry errored: ${err.message}`;
    return receipt;
  }
}

// redeem a link for the owner and push the receipt. fire-and-forget by
// contract: the capture stays the record of truth in supabase.
export async function redeemAndNotify(
  url: string,
  context: { meetingTitle: string; captureTitle: string; scarce?: string },
): Promise<boolean> {
  const identity = getOwnerIdentity();
  if (!identity) {
    console.warn("prixie: redeem skipped, no PRIXIE_OWNER_EMAIL configured");
    return false;
  }

  const receipt = await enterForm(url, identity);
  const email = buildRedeemEmail(receipt, context);
  return await notifyOwner(email);
}

// the consent policy (the owner, oct 22 2026): prixie never ever accepts
// cookies that are not necessary, and never ever signs up for
// newsletters. this is not a preference she weighs per site: it is a
// standing rule, so it lives as a policy module every surface shares.
//
// the pure half decides from button labels; the engine half walks a
// consent banner and clicks what the policy says. what the policy never
// says is "accept all": if a banner offers no reject at all, she looks
// for a close (a banner going away is not consent), and a banner with
// neither is left standing and reported, never agreed to.
//
//   consentChoice(labels)      which button, if any, deserves a click
//   newsletterOptIn(text)      does this checkbox smell like a
//                              newsletter box at all?
//   newsletterDirection(text)  which way the tick cuts: opt-in (tick =
//                              subscribe, never hers) or opt-out (tick =
//                              stay off the list, always hers)
//   dismissConsentBanners()    the engine walk, bounded and honest
//   alignNewsletterBoxes()      every newsletter box read to its rule:
//                              opt-ins never checked (a pre-checked one
//                              is the site's yes, not hers), opt-outs
//                              always checked (the owner, oct 22 2026: the
//                              signup needs the real email, the form
//                              makes her tick to NOT be added, she
//                              ticks it)

import { cdpExecute } from "./browserbase.ts";

// ---------------------------------------------------------------------------
// the pure policy
// ---------------------------------------------------------------------------

export interface ConsentChoice {
  action: "click" | "none";
  label?: string;
}

// labels that reject everything non-essential, best first. "reject all"
// from a non-essential banner rejects the marketing cookies, not the
// necessary ones (those are not offered as a choice; they are the floor).
const REJECT_LABELS = [
  "reject all", "reject all cookies", "reject non-essential",
  "reject optional", "reject", "decline all", "decline", "deny all",
  "deny", "refuse all", "refuse",
];

// labels that keep only the necessary/essential set
const NECESSARY_ONLY_LABELS = [
  "only necessary", "only necessary cookies", "necessary only",
  "essential only", "only essential", "essential cookies only",
  "necessary cookies only", "only necessary cookies",
  "reject non-essential cookies", "accept necessary", "accept essential",
  "accept selected", "confirm my choices", "save my choices",
  "save preferences", "save my preferences", "save choices",
];

// labels that would accept non-essential cookies. these are NEVER
// clicked, even when they are the only button besides nothing.
const ACCEPT_LABELS = [
  "accept all", "accept all cookies", "accept", "accept cookies",
  "agree", "agree to all", "i agree", "allow all", "allow", "ok",
  "okay", "got it", "continue", "got it, thanks",
];

// labels that close the banner without consenting (a dismissal, not an
// agreement). used only when no reject exists.
const CLOSE_LABELS = ["close", "dismiss", "x"];

function norm(s: string): string {
  return (s || "").trim().toLowerCase();
}

function matches(label: string, wanted: string[]): boolean {
  const l = norm(label);
  return wanted.some((w) => l === w || l.includes(w));
}

// which button on a consent banner gets the click. pure.
export function consentChoice(labels: string[]): ConsentChoice {
  const usable = labels.filter((l) => norm(l).length > 0 && norm(l).length <= 60);
  for (const l of usable) if (matches(l, REJECT_LABELS)) return { action: "click", label: l };
  for (const l of usable) if (matches(l, NECESSARY_ONLY_LABELS)) return { action: "click", label: l };
  for (const l of usable) if (matches(l, CLOSE_LABELS)) return { action: "click", label: l };
  // accept-only banners: no consent, no close. the banner stays; the
  // join flow continues around it, and the receipt says so.
  return { action: "none" };
}

// does this text smell like a newsletter/marketing opt-in? checked
// against a checkbox's name, id, and nearby label text. pure.
const NEWSLETTER_MARKERS = [
  "newsletter", "mailing list", "mailinglist", "marketing",
  "promotional", "promo emails", "email updates", "product updates",
  "stay up to date", "stay informed", "subscribe", "opt-in", "opt in",
];

export function newsletterOptIn(text: string): boolean {
  // underscores and hyphens read as spaces: email_updates is
  // "email updates" with a different keyboard
  const t = norm(text).replace(/[_\-.]+/g, " ");
  if (!t) return false;
  return NEWSLETTER_MARKERS.some((m) => t.includes(m));
}

// the negation shapes that flip a box's meaning: "tick if you do NOT
// wish to receive" is opt-out (the tick keeps her OFF the list), and
// those are the ones she clicks. "subscribe to our newsletter" is
// opt-in, and those she never touches.
const OPT_OUT_MARKERS = [
  "do not wish", "do not want", "do not receive", "dont wish",
  "dont want", "dont receive", "not to be added", "not to receive",
  "not be added", "opt out", "unsubscribe", "no thanks",
  "stop receiving", "stop these emails", "rather not", "prefer not",
];

export function newsletterDirection(text: string): "opt_in" | "opt_out" | "none" {
  // apostrophes read as nothing: "don't" is "dont", "you'll" is "youll
  const t = norm(text).replace(/[_\-.]+/g, " ").replace(/['’]/g, "");
  if (!t) return "none";
  if (OPT_OUT_MARKERS.some((m) => t.includes(m))) return "opt_out";
  if (NEWSLETTER_MARKERS.some((m) => t.includes(m))) return "opt_in";
  return "none";
}

// ---------------------------------------------------------------------------
// the engine half
// ---------------------------------------------------------------------------

export interface ConsentReceipt {
  sawBanner: boolean;
  clicked?: string; // the label that got the click, if any
  leftStanding: boolean; // a banner is still up, and she did not agree
}

// one page read: the visible consent-banner buttons, collected for the
// policy. the selector scope is deliberately broad (cmp/onetrust/
// cookie/gdpr consent surfaces), and the return is a json list of
// {label, i} pairs; i is the index into the SAME scope for the click.
const COLLECT_EXPR = `
  (() => {
    const scope = [
      "[id*='cookie' i]", "[class*='cookie' i]", "[id*='consent' i]",
      "[class*='consent' i]", "[id*='onetrust' i]", "[class*='onetrust' i]",
      "[class*='cmp' i]", "[data-testid*='cookie' i]",
      "div[role='dialog']", "[aria-label*='cookie' i]",
    ].join(", ");
    const roots = Array.from(document.querySelectorAll(scope));
    const btnScope = "button, a, div[role='button'], input[type='submit']";
    const seen = [];
    const buttons = [];
    for (const root of roots) {
      for (const b of root.querySelectorAll(btnScope)) {
        const label = (b.textContent || b.getAttribute("aria-label") || "").trim();
        if (!label || label.length > 60) continue;
        const key = label.toLowerCase();
        if (seen.includes(key)) continue;
        seen.push(key);
        buttons.push(label);
      }
    }
    return buttons.length ? JSON.stringify(buttons) : "";
  })()
`;

// click one button by its label inside the consent scope. returns
// whether a click landed.
function clickConsentButton(sessionId: string, label: string): Promise<boolean> {
  return cdpExecute(sessionId, "Runtime.evaluate", {
    expression: `
      (() => {
        const scope = [
          "[id*='cookie' i]", "[class*='cookie' i]", "[id*='consent' i]",
          "[class*='consent' i]", "[id*='onetrust' i]", "[class*='onetrust' i]",
          "[class*='cmp' i]", "[data-testid*='cookie' i]",
          "div[role='dialog']", "[aria-label*='cookie' i]",
        ].join(", ");
        const roots = Array.from(document.querySelectorAll(scope));
        const btnScope = "button, a, div[role='button'], input[type='submit']";
        const wanted = ${JSON.stringify(norm(label))};
        for (const root of roots) {
          for (const b of root.querySelectorAll(btnScope)) {
            const l = (b.textContent || b.getAttribute("aria-label") || "").trim();
            if (!l || l.length > 60) continue;
            if (l.trim().toLowerCase() === wanted || l.trim().toLowerCase().includes(wanted)) {
              b.click();
              return "clicked";
            }
          }
        }
        return "not found";
      })()
    `,
    returnByValue: true,
  }).then((r: any) => r?.result?.value === "clicked").catch(() => false);
}

// the walk: collect, decide, click, and check whether the banner is
// still standing. bounded: one collect, at most three clicks (reject,
// then a preferences-save path), one final look. never throws: a page
// without a banner is the common case and costs one read.
export async function dismissConsentBanners(sessionId: string): Promise<ConsentReceipt> {
  const receipt: ConsentReceipt = { sawBanner: false, leftStanding: false };
  let labels: string[] = [];
  try {
    const r = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: COLLECT_EXPR,
      returnByValue: true,
    });
    labels = r?.result?.value ? JSON.parse(r.result.value) : [];
  } catch {
    return receipt; // the page would not say: nothing was agreed to
  }
  if (!labels.length) return receipt;

  receipt.sawBanner = true;
  const choice = consentChoice(labels);
  if (choice.action === "click" && choice.label) {
    const landed = await clickConsentButton(sessionId, choice.label);
    if (landed) {
      receipt.clicked = choice.label;
      // a manage-preferences path may need the save confirmed; try the
      // save labels once, silently. a click that already dismissed the
      // banner costs a harmless not-found.
      for (const save of ["save", "confirm my choices", "save preferences"]) {
        if (labels.some((l) => matches(l, [save]))) {
          await clickConsentButton(sessionId, save);
          break;
        }
      }
    }
  }

  // the final look: is any consent-scope button still visible?
  try {
    const r = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: COLLECT_EXPR,
      returnByValue: true,
    });
    const still = r?.result?.value ? JSON.parse(r.result.value) : [];
    receipt.leftStanding = still.length > 0;
  } catch {
    receipt.leftStanding = false;
  }
  return receipt;
}

// every newsletter checkbox is read to its rule and made to agree
// (the owner, oct 22 2026):
//   opt-in boxes (tick = subscribe): never checked; a pre-checked one
//     is the site's yes, not hers, and gets unchecked
//   opt-out boxes (tick = stay off the list, common on signups that
//     need the real email): always checked, clicked if not already
// bounded, never throws, returns how many boxes moved which way.
export interface NewsletterAlignment {
  optInsUnchecked: number;
  optOutsChecked: number;
}

export async function alignNewsletterBoxes(
  sessionId: string,
): Promise<NewsletterAlignment> {
  const out: NewsletterAlignment = { optInsUnchecked: 0, optOutsChecked: 0 };
  try {
    const r = await cdpExecute(sessionId, "Runtime.evaluate", {
      expression: `
        (() => {
          const markers = ${JSON.stringify(NEWSLETTER_MARKERS)};
          const optOuts = ${JSON.stringify(OPT_OUT_MARKERS)};
          const reads = (box) => [
            box.name, box.id,
            (box.getAttribute("aria-label") || ""),
            (box.closest("label")?.textContent || ""),
          ].join(" ").toLowerCase().replace(/[_\-.]+/g, " ").replace(/['’]/g, "");
          const moved = { optInsUnchecked: 0, optOutsChecked: 0 };
          for (const box of Array.from(document.querySelectorAll("input[type='checkbox']"))) {
            const t = reads(box);
            const isOptOut = optOuts.some((m) => t.includes(m));
            const isNewsletter = isOptOut || markers.some((m) => t.includes(m));
            if (!isNewsletter) continue;
            if (isOptOut) {
              if (!box.checked) { box.click(); moved.optOutsChecked++; }
            } else {
              if (box.checked) { box.click(); moved.optInsUnchecked++; }
            }
          }
          return JSON.stringify(moved);
        })()
      `,
      returnByValue: true,
    });
    const moved = r?.result?.value ? JSON.parse(r.result.value) : null;
    return moved ?? out;
  } catch {
    return out;
  }
}

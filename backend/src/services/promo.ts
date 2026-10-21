// promo codes: hosts drop them in chat ("use HACK50 for 20% off") and
// most platforms put the redeem button somewhere OTHER than the
// checkout flow entirely (the owner, oct 21 2026). so code entry is a first
// class step of form entry, not an afterthought of the email fill.

// the selectors that mean "type the code here, not an email, not a name"
export const CODE_SELECTORS = [
  'input[name*="promo" i]',
  'input[name*="coupon" i]',
  'input[name*="code" i]',
  'input[id*="promo" i]',
  'input[id*="code" i]',
  'input[placeholder*="code" i]',
];

// the buttons that open the code UI. "redeem" first: it is the word
// platforms actually use, often sitting alone on a landing page.
export const REDEEM_TEXTS = [
  "redeem",
  "redeem code",
  "promo code",
  "have a promo code",
  "have a code",
  "apply code",
  "enter code",
  "gift code",
  "discount code",
  "apply promo",
];

// pure: pull a promo code out of chat speech. "use HACK50", "code:
// BUILD10", "the promo is FALL24" all yield the token. she never invents
// one: no candidate, no attempt.
export function extractPromoCode(text: string): string | null {
  const patterns = [
    /(?:promo(?:\s+code)?|discount(?:\s+code)?|coupon(?:\s+code)?|code)\s*(?:is|:|=)?\s*["']?([A-Z0-9][A-Z0-9_-]{2,15})["']?/i,
    /(?:use|using|enter|try|apply)\s+(?:code\s+)?["']?([A-Z0-9][A-Z0-9_-]{2,15})["']?/i,
    /\b([A-Z][A-Z0-9]*\d[A-Z0-9]*)\b/, // bare SCREAMING123 token with a digit
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      // the raw match keeps its original case: real codes are typed in
      // caps ("use HACK50"), ordinary words are not ("code will be sent").
      // she does not invent codes, so no caps, no attempt.
      if (!/[A-Z]/.test(m[1])) continue;
      const candidate = m[1].toUpperCase();
      // words that are not codes, including tech tokens with digits in them
      const notCodes = ["THE", "AND", "FOR", "NOW", "OFF", "HERE", "LINK", "CODE", "K8S", "COVID19", "MP4", "MP3", "WEB3", "H264", "GIF89A"];
      if (notCodes.includes(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

// scarcity detection: she hears "first come first serve" or "only the
// first 50 people" spoken in the meeting and understands it as urgency.
// a scarce code changes the correct response: notify is no longer enough,
// she may have to act before the meeting ends. pure functions only.

export interface ScarcityResult {
  scarce: boolean;
  matched: string[];
  cap?: number; // how many units are available, if she heard a number
}

const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /first[ -]?come[,]?[ ]?first[ -]?serve/, label: "first come first serve" },
  { re: /\bfcfs\b/, label: "fcfs" },
  { re: /first (\d+(?:[.,]\d+)*)\s*(?:million|thousand)?\s*(?:people|attendees|folks|students|signups|submissions|registrants|spots|comments|users)/, label: "first N people" },
  { re: /first (\d+(?:[.,]\d+)*)\s*to\s*(?:use|enter|redeem|sign\s?up|register|fill|submit|claim|comment)/, label: "first N to act" },
  { re: /(?:only|just|limited to)\s*(\d+(?:[.,]\d+)*)\s*(?:spots|seats|tickets|codes|slots|openings|spots left|codes left)/, label: "limited spots" },
  { re: /while (?:supplies|spots|codes|seats|stock) last/, label: "while supplies last" },
  { re: /limited (?:quantity|supply|spots|seats|codes|availability)/, label: "limited quantity" },
  { re: /expires (?:at|when|in|after)|only valid (?:until|during)|until the end of (?:the|this) (?:meeting|call|stream|class|event)/, label: "time limited" },
];

export function detectScarcity(text: string): ScarcityResult {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  let cap: number | undefined;

  for (const { re, label } of PATTERNS) {
    const m = lower.match(re);
    if (m) {
      matched.push(label);
      if (m[1] && cap === undefined) {
        const parsed = parseInt(m[1].replace(/[.,]/g, ""), 10);
        if (!isNaN(parsed)) cap = parsed;
      }
    }
  }

  return { scarce: matched.length > 0, matched, cap };
}

// does the utterance contain an action instruction bound to scarcity?
// "the first 50 people to enter this form get it" -> she should know the
// window is people-counted, not just time-counted.
export function scarcityKind(result: ScarcityResult): "none" | "time" | "people" {
  if (!result.scarce) return "none";
  const people = ["first N people", "first N to act", "limited spots"].some((l) =>
    result.matched.includes(l)
  );
  return people ? "people" : "time";
}

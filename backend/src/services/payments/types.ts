// the payments rail contract. one interface, two honest
// implementations, and the receipt both must fill truthfully.

export type RailName = "kernel" | "agentcard" | "none";

export interface VaultCheckoutReceipt {
  url: string;
  rail: RailName;
  attempted: boolean;
  promo_applied: boolean; // a code field was found and the code landed
  email_filled: boolean;
  vault_filled: boolean; // the rail put the card in, or tried to
  card_masked?: string; // masked last4 only, never digits
  approval_sent?: boolean; // the rail asked the owner to approve (kernel)
  approval_deadline_min?: number;
  total_read: string; // what the page showed after the promo
  total_free: boolean; // parsed: $0 / free. fail closed: unknown is not free
  completed: boolean; // the pay button was clicked on a free total
  stopped_reason?: string; // why she stopped; there is always a reason
  detail: string;
}

// what the orchestrator tells the rail at the card moment
export interface CardMoment {
  browserId: string;
  pageUrl: string; // the checkout's exact current url
  origin: string; // the checkout origin the card must be bound to
  merchantHint: string; // hostname, for the card item / CLI merchant
  capMinor: number; // amount cap in minor units (headroom, see mod.ts)
  currency: string;
  notifyApproval: (a: {
    url: string; // the owner's approval link, emailed, never receipted
    maskedLine: string;
    deadlineMin: number;
  }) => Promise<boolean>;
  receipt: VaultCheckoutReceipt; // the rail may set stopped_reason first
}

// what the rail hands back
export interface CardPlacement {
  ok: boolean;
  reason?: string;
  maskedLast4?: string;
  handle?: unknown; // rail-private cleanup handle (item key, request id)
}

// a rail puts the card in, and knows how to clean up after itself.
// the digits are the rail's business and never the receipt's.
export interface PaymentRail {
  name: RailName;
  configured(): Promise<boolean>;
  putCardIn(ctx: CardMoment): Promise<CardPlacement>;
  cleanup(placement: CardPlacement, used: boolean): Promise<void>;
}

export interface RailPick {
  rail: RailName | null;
  reason?: string;
}

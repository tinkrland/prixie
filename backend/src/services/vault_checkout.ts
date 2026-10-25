// the vault checkout, kept as the door form_entry has always knocked
// on (the owner, oct 25 2026). the implementation moved to services/payments:
// two rails now share one walk, kernel's vault (digits never through
// prixie, the owner approves each purchase) and agentcard.ai's issued
// one-time cards (instant, the one carve-out where an issued card's
// digits pass through prixie's memory once, never logged or stored).
// the money rule is unchanged and lives in the walk: only a parsed
// $0 total after the promo ever completes, everything else stops
// before the pay button with the page's words in the receipt.

export {
  totalIsFree,
  vaultHandoffWanted,
  vaultCheckout,
} from "./payments/mod.ts";
export type { VaultCheckoutReceipt } from "./payments/types.ts";

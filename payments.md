# payments

the card moment, twice over. some promo codes only apply inside a
gateway checkout, the checkout demands a card, and prixie's money rule
does not bend: only a $0 total after the promo ever completes, anything
else stops before the pay button with the page's words in the
receipt. or simply put: the rails exist so a free checkout can finish
without the owner awake, and so a not-free one never does.

the card moment lives in `backend/src/services/payments/`: one walk
(`mod.ts`) shared by two rails (`kernel_rail.ts`, `agentcard_rail.ts`),
behind the same door form_entry always knocked on
(`services/vault_checkout.ts`, now a re-export). the walk: open a
kernel browser (kernel is the checkout engine as a browser here,
browserbase stays the join engine for meetings), apply the promo,
enter her email, advance without paying, put the card in via the
rail, read the total from the page's words, stop or pay.

## the money rule (unchanged, and the rails are downstream of it)

- the handoff fires only when a form detects a card AND a promo code
  exists (the rails are for gateway-level promos, not shopping)
- only a parsed $0.00 / "total: free" completes. unreadable is not
  free, nonzero is not free: fail closed
- the card is bound to a $1 headroom cap
  (`PAYMENT_HEADROOM_MINOR`), never the total: it exists for the $0/$1
  setup authorization merchants place on card entry, so the worst case
  of a mis-parsed page stays one dollar
- the browser dies the moment the payment portion is managed; every
  stop says why, in the receipt and in the owner's email

## the kernel rail: kernel.sh, provider link or agentcard.sh

kernel's documented model (researched oct 25 2026, docs + live api
probe): the persistent thing is a WALLET item, the owner's $5 buffer card
connected once through kernel's hosted flow (never the main card, and
`KERNEL_VAULT` names the vault). the card item is EPHEMERAL: created
per checkout, bound to the checkout origin (fill works on that origin
and nowhere else), the headroom cap in minor units, consumed at first
use, deleted after. kernel's fill operation types it in: digits pass
vault -> page and never through prixie, who holds only kernel's masked
last4.

the honest limit: every kernel wallet provider (link, agentcard.sh)
requires a human approval per purchase, even at a $0 total. so the
rail emails the owner the approval link (the link is the owner's, never the
receipt's) and parks up to `KERNEL_APPROVAL_WAIT_MIN` (default 10
minutes). no approval, no payment, no silent retry.

unverified against a live gateway: item create / authorize / delete
follow kernel's documented shapes and have not been exercised (the
wallet is not enrolled yet); $0 authorization acceptance; whether a $1
headroom cap passes merchants that validate cards with a $1 hold.

## the agentcard rail: agentcard.ai, issued one-time cards

agentcard.ai is alchemy's product (NOT agentcard.sh, the yc startup
kernel partners with). its issued one-time-card path is the only
instant, approval-free card in the landscape (verified from their skill
spec v2.2.0 and a live test account, oct 25 2026): `agentcard request
new --source agentcard` prints a card capped to the requested amount,
funded by a hold on the saved funding card (the same $5 buffer,
enrolled once via agentcard's hosted stripe page), live 7 days, single
use. later renewal charges decline: the stand-in is dead after the
checkout and cannot spend beyond its cap. the test account is
redacted: the owner's test account, env only, never committed, test-only, never in committed code.

the carve-out (the owner, oct 25 2026), and it is exactly this wide: an
ISSUED one-time card from the agentcard cli may pass through prixie's
process memory once, to be typed into that checkout and nowhere else.
a real card may never. the digits are never logged, stored, or
receipted (the receipt carries the last4 only), the unused card is
cancelled by id, and if a kyc gate or 3ds challenge appears the
checkout stops and the owner decides.

## the structural rules, checked structurally

the test suite enforces the carve-out mechanically
(`vault_checkout_test.ts`): card field selectors exist ONLY in
`agentcard_rail.ts`; the walk, the kernel rail, the types, and the door
stay clean of them; and no payment source contains a card-shaped
literal. if that test ever fails, someone reached for the card: stop
them.

## the third rail candidate (documented, not built)

agentcard.sh's vault (faq, oct 25 2026): the owner's real card stored
passkey-encrypted (nobody but the owner can decrypt it, not even
agentcard.sh), no kyc, 23 processors + amazon mapped, and the missing
feature both built rails lack: opt-in auto-approval with a per-amount
threshold. auto-approve under $1 on the buffer card would make the
privacy rail (digits never through prixie) autonomous. the rail is
not built: the kernel integration of agentcard.sh already carries the
alias mechanics, and the auto-approval setting would need the owner's
account setup first.

## rail picking

`PAYMENT_RAIL` forces (`kernel` | `agentcard`); else kernel first
(digits never through prixie beats instant); else agentcard; else an
honest stop with the reason in the receipt.

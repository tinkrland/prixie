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

## the agentvault.io candidate (verified from their docs, oct 28 2026, not built)

agentvault.io (agent cards + saved logins for agents) is the first
candidate that closes the prompt-injection hole structurally: the
agent's context only ever holds hollow tokens (av_card_1_number_xxx)
that charge nothing anywhere, and the real values are typed by a
hardware-attested enclave when the checkout submits. a compromised or
injected agent leaks nothing. that is a different claim from both
built rails: kernel fills from its vault but still needs the owner's
approval on every purchase, and agentcard.ai issues real (one-time,
capped) digits that pass through her memory once.

verified shape (docs.agentvault.io, oct 28 2026):
- the MCP server (mcp.agentvault.io/mcp, oauth only, no api key) is a
  FULL browser lane, not just token fills: open_page, click, press,
  wait_for_selector, observe_page, snapshot_page, detect_challenge,
  fill_checkout, fill_login, request_challenge_handoff,
  get_session_outcome, get_run_report, close_session (29 tools). the
  checkout page lives in THEIR proxy browser; the enclave types the
  card into it. so the integration shape is the kernel rail's: hand
  the payment gate to the vault's browser during the checkout moment,
  browserbase keeps the meeting.
- policy-based approval instead of per-purchase: per-card daily /
  weekly / monthly / per-txn caps, optional merchant allowlists,
  confirmation threshold at/above an amount, kill switch, auto-pause
  on a limit. what both built rails lack.
- challenges are handled honestly: 3-D Secure, one-time codes, CAPTCHA
  and silent blocks hand the live page back to the owner
  (request_challenge_handoff), and an outcome is confirmed from the
  live page + run report + receipt before claiming success.
- CVV is THE settled path now (live-cvv guide, oct 28 2026): never
  stored, because PCI DSS 3.3.1 forbids storing it at all, and their
  guide forbids the agent sourcing it from ANYWHERE ("a code typed into
  a chat ends up in the model provider's records"). the actual
  mechanism: fill the number and the code in ONE fill_checkout call
  (number first); the code fill pauses up to 3 minutes while the OWNER
  types it into the vault's own prompt; their enclave puts it in the
  merchant field; the agent never sees it. a fill that cannot complete
  returns cvv_entry_required and the honest move is to report it, not
  to retry with a sourced code. so cvv-demanding merchants cost exactly
  one owner prompt, and that prompt IS the design, not a gap to fill
  with a vault: a stored CVV (infisical agent vault or any other) would
  break the rule the rail is built around, so the combination is out by
  policy, not by effort.
- infisical's agent-vault (github.com/Infisical/agent-vault, MIT, docs
  agent-vault.mintlify.app) is a DIFFERENT animal and not a cvv answer:
  an HTTP credential PROXY for agents (29-ish services model: access
  bundles, variables, oauth creds; the agent holds dummy credentials
  and the proxy swaps real ones at the request layer). it never fills a
  browser form, so it cannot reach a checkout at all. where it DOES
  fit prixie is the other custody domain: HER OWN http credentials
  (llm keys, github, slack, mcp servers, her own signups behind oauth)
  instead of env vars, self-hosted and per-service revocable. that is
  the password-manager horizon row's natural home and a separate lane
  from the payment rail. custody rule from kernel applies here too:
  each provider swaps only inside its own boundary (kernel fills only
  its browsers, agentvault.io types only in its enclave, infisical
  swaps only proxied HTTP), so a credential lives with whichever
  provider does the swap, never centralized.
- logins too: one credential per site swapped at submit, TOTP without
  the secret leaving the backend, agent-signup with approval, and url
  locking per token. covers the kernel-managed-auth job as well.
- pricing (oct 28 2026): free = 1 agent card, 5 payments/month,
  unlimited credentials; plus $19/mo (3 free months for first 1000) =
  5 cards, 100 payments/month, daily spend limits + webhooks;
  enterprise = merchant allowlists.
- the checkout recipe registry (get_checkout_recipes + open json
  recipes per merchant, schema + validator + autonomy benchmark) is
  useful to prixie's OWN checkout walk with or without the rail.
- trust boundary, theirs and ours: it may only be connected where
  nobody but the owner can reach the agent (one gateway = one trust
  boundary). solas is owner-only, so that holds; also the hosted
  server refuses account tools until the owner sets Connected apps
  permissions, agent cards and destinations in the dashboard.

blocked at connect time (oct 28 2026): the mcp config here
(.agents/mcps/config.json) supports remote urls and headers, not an
oauth flow, and the server answers 401 + oauth metadata to anonymous
calls. the owner adds it (editor Tools tab if its dialog runs oauth,
else another client) and signs in once; then the evaluation is one
capped sandbox checkout against their proxy browser, in the shape of
the agentcard step-4 test.

## rail picking

`PAYMENT_RAIL` forces (`kernel` | `agentcard`); else kernel first
(digits never through prixie beats instant); else agentcard; else an
honest stop with the reason in the receipt.

### the $0 autonomy case (anne's correction, oct 28 2026)

the walk exists for 0-funding redemptions: promo code applied, cc
gate still wants a card, total parsed at $0, nothing ever charged. for
that case the autonomy question is `whose card is it`, because a rail
that ISSUES the card owns its cvv and never needs the owner at the
checkout:

- agentcard.ai: issues one-time cards, so digits AND cvv are the
  rail's own, instant, approval-free = THE autonomous $0 rail. this is
  exactly why the digits-once carve-out exists. pending anne's kyc.
- kernel: issues ephemeral cards too, so the cvv is never a problem,
  but every purchase parks for the owner's approval even at $0.
  autonomous on cvv, gated on approval.
- agentvault.io: uses the OWNER'S cards, so the cvv is hers, so a live
  prompt per cvv-demanding checkout is inherent to its design, not a
  bug. verified oct 28 2026: `get_token_catalog` returns identity,
  addresses, cards, logins and NEVER a cvv; there is no api parameter
  that accepts one, and infisical's proxy cannot hand one across (its
  swap happens on http requests the agent makes; the enclave types
  inside its own boundary). so agentvault.io belongs to the real-money
  case where the owner is in the loop, NOT to unattended $0 autonomy.
  one honest nuance: a merchant that does not ask for the cvv on a $0
  card-on-file checkout can complete on agentvault.io with no prompt,
  but that depends on the merchant form, while kernel and agentcard do
  not.

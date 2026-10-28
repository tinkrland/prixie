// the shared viable-join-request sender whitelist (anne, oct 28 2026).
//
// the rule predates the providers: only mail from whitelisted senders
// is a meeting joining request, whoever delivers it. agentmail's
// forwarding path named it PRIXIE_FORWARD_WHITELIST; the true-inbox
// providers (dearagent.sh, carlyemail.com) read the same list, spelled
// PRIXIE_MAIL_SENDER_WHITELIST, falling back to the forward name so
// the owner configures senders once for every inbox rail.
//
// unset = the door stays closed, same rule as every secret in this
// repo. a sender that cannot be read from the message is not
// whitelisted: failing closed is the only safe direction.

export function mailSenderWhitelisted(from: string | undefined): boolean {
  const raw = Deno.env.get("PRIXIE_MAIL_SENDER_WHITELIST") || Deno.env.get("PRIXIE_FORWARD_WHITELIST");
  if (!raw) return false;
  const address = (from || "").match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
  if (!address) return false;
  return raw
    .split(",")
    .map((e) => e.trim().match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase())
    .filter(Boolean)
    .includes(address);
}

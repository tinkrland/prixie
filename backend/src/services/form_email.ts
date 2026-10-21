// form email strategy: the address that goes INTO a form is chosen, not
// fixed (the owner, oct 21 2026). four ways she enters emails, and none of
// them is the owner's:
//
//   regular    PRIXIE_FORM_EMAIL, her standing address
//   plus       prixie+<service>@..., same inbox, per-service trace: if
//              one tag starts drawing spam she knows exactly who sold it
//   disposable a throwaway from a disposable mail site. discretionary:
//              random saas at hackathons, "download gated behind a
//              newsletter signup", anything she would rather not owe her
//              real address to
//   business   PRIXIE_BUSINESS_EMAIL, for signups that demand a business
//              address. it forwards to the same inbox anyway.
//
// no real address is ever hardcoded here: they live in env, and the repo
// stays clean so github does not become a spam magnet (the owner's rule).

export type FormEmailMode = "regular" | "plus" | "disposable" | "business";

export interface FormEmail {
  mode: FormEmailMode;
  address: string;
  // for disposables: how to reach that inbox later, if ever needed
  disposable?: { provider: string; token?: string };
}

// pure: insert a +tag before the @. forms that reject plus addressing
// are rare and she falls back to regular.
export function plusAddress(email: string, tag: string): string {
  const clean = tag.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  if (!clean) return email;
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  return `${email.slice(0, at)}+${clean}${email.slice(at)}`;
}

// pure: derive the per-service tag from the form's own domain, so
// figma.com -> figma, cdn.workshop.io -> workshop
export function tagFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    // take the registrable part: second-level for plain tlds, third for co.uk style
    const root = parts.length > 2 && parts[parts.length - 2].length <= 3
      ? parts[parts.length - 3]
      : parts[parts.length - 2];
    return root || host.split(".")[0];
  } catch {
    return "form";
  }
}

// disposable mail: mail.tm has a clean free api. she creates an account
// on demand and keeps the token in the receipt in case the confirmation
// ever needs reading. receiving is a later concern, not this turn's.
const MAIL_TM = "https://api.mail.tm";

const RANDOM_WORDS = ["quiet", "brisk", "amber", "north", "hazel", "cedar", "wren", "slate"];

export async function createDisposableEmail(): Promise<FormEmail> {
  const domainsRes = await fetch(`${MAIL_TM}/domains?page=1`);
  if (!domainsRes.ok) throw new Error(`mail.tm domains failed: ${domainsRes.status}`);
  const domains = await domainsRes.json();
  const domain = domains["hydra:member"]?.[0]?.domain;
  if (!domain) throw new Error("mail.tm returned no domains");

  const word = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
  const local = `${word}${Math.floor(Math.random() * 9000 + 1000)}`;
  const password = crypto.randomUUID();

  const accountRes = await fetch(`${MAIL_TM}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: `${local}@${domain}`, password }),
  });
  if (!accountRes.ok) {
    const detail = await accountRes.text().catch(() => "");
    throw new Error(`mail.tm account failed: ${accountRes.status} ${detail}`);
  }

  const tokenRes = await fetch(`${MAIL_TM}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: `${local}@${domain}`, password }),
  });
  const tokenData = tokenRes.ok ? await tokenRes.json() : undefined;

  return {
    mode: "disposable",
    address: `${local}@${domain}`,
    disposable: { provider: "mail.tm", token: tokenData?.token },
  };
}

// resolve which address enters this form. mode comes from the capture
// request (form_email_mode) or defaults to plus: same inbox as regular,
// but the tag says who leaked if the spam ever starts.
export async function chooseFormEmail(
  mode: FormEmailMode | null | undefined,
  formUrl: string,
): Promise<FormEmail | null> {
  if (mode === "disposable") {
    return await createDisposableEmail();
  }

  if (mode === "business") {
    const business = Deno.env.get("PRIXIE_BUSINESS_EMAIL");
    if (!business) {
      console.warn("prixie: business email mode requested but PRIXIE_BUSINESS_EMAIL is unset");
      return null;
    }
    return { mode: "business", address: business };
  }

  const regular = Deno.env.get("PRIXIE_FORM_EMAIL");
  if (!regular) return null;

  if (mode === "plus" || mode == null) {
    return { mode: "plus", address: plusAddress(regular, tagFromUrl(formUrl)) };
  }
  return { mode: "regular", address: regular };
}

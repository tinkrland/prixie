// whatsapp id shapes, shared by the inbound route and the send service so
// one file owns the format knowledge (anne, oct 29 2026).
//
// WAHA uses the whatsapp JID form "<digits>@c.us" for a person chat. a
// number written by a human can carry a plus, spaces or dashes; the JID
// never does. anything that is not a plain personal number (a group id
// like "...@g.us", a broadcast list) is NOT an id we send to.

export function whatsappChatId(digitsOrJid: string | undefined | null): string | null {
  if (!digitsOrJid) return null;
  const raw = digitsOrJid.trim().toLowerCase();
  const m = /^(\d+)(?:@c\.us)?$/.exec(raw);
  return m ? `${m[1]}@c.us` : null;
}

export function whatsappDigits(from: string | undefined | null): string | null {
  if (!from) return null;
  const m = /^(\d+)@c\.us$/.exec(from.trim().toLowerCase());
  return m ? m[1] : null;
}

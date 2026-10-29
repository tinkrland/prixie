// the whatsapp send side (anne, oct 29 2026): relay a line back to the
// owner over WAHA's REST api.
//
//   POST {WAHA_BASE_URL}/api/sendText
//   { session, chatId, text }   with the X-Api-Key header
//
// contract, same as every rail: unset config = a warn and a no, a failed
// send returns false and never throws into the caller's path. this is
// NOT wired into notifyOwner yet: the relay-back row stays
// email-only until the owner links her own number and the text rail is
// live (the horizon row).

import { whatsappChatId } from "../services/whatsapp_ids.ts";

export interface WhatsAppSendResult {
  sent: boolean;
  reason?: string;
}

export async function sendWhatsApp(
  toDigits: string,
  text: string,
): Promise<WhatsAppSendResult> {
  const base = (Deno.env.get("WAHA_BASE_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("WAHA_API_KEY");
  const session = Deno.env.get("WAHA_SESSION") || "default";
  if (!base || !key) {
    console.warn("prixie: whatsapp send skipped (WAHA_BASE_URL / WAHA_API_KEY unset)");
    return { sent: false, reason: "no_config" };
  }
  const chatId = whatsappChatId(toDigits);
  if (!chatId) return { sent: false, reason: "bad_number" };
  if (!text.trim()) return { sent: false, reason: "empty_text" };

  try {
    const res = await fetch(`${base}/api/sendText`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({ session, chatId, text }),
    });
    if (!res.ok) {
      console.warn(`prixie: whatsapp send failed: ${res.status}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err: any) {
    console.warn(`prixie: whatsapp send errored: ${err.message}`);
    return { sent: false, reason: "error" };
  }
}

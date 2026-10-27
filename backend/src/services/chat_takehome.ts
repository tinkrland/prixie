// the chat as a take-home artifact (the owner, oct 27 2026): the spoken
// transcript has always been taken home; the TYPED conversation was
// read for triggers (q&a, attendance forms, links, expiry) and then
// dropped. this module persists every chat line as it arrives, hers
// included, and serializes it for the transcript's chat_log column.
// the meeting chat is part of what happened; the take-home keeps it.

import { getSupabase, getMeetingByBotId } from "./supabase.ts";

export interface ChatLine {
  meeting_id: string;
  speaker: string;
  message: string;
  // "chat" = someone typed it in the meeting; "chat_sent" = her own
  // send. the take-home distinguishes them, never merges.
  source?: "chat" | "chat_sent";
}

export interface StoredChatLine {
  id: string;
  meeting_id: string;
  speaker: string;
  message: string;
  source: string;
  created_at: string;
}

// persist one line. best effort by design: a persistence hiccup must
// never kill the chat triggers that run after it in the webhook.
export async function recordChatLine(line: ChatLine): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("meeting_chat_lines").insert([{
      meeting_id: line.meeting_id,
      speaker: line.speaker,
      message: line.message,
      source: line.source || "chat",
    }]);
    if (error) {
      console.error("prixie: failed to record chat line", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("prixie: chat line recording threw", err);
    return false;
  }
}

// her own sends (the provider's chat seams have the bot id, not the
// meeting). no live meeting found = the line is not hers to keep.
export async function recordOwnChatLine(botId: string, message: string): Promise<boolean> {
  const meeting = await getMeetingByBotId(botId);
  if (!meeting) return false;
  return recordChatLine({
    meeting_id: meeting.id,
    speaker: "prixie",
    message,
    source: "chat_sent",
  });
}

export async function getChatLines(meetingId: string): Promise<StoredChatLine[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("meeting_chat_lines")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data || []) as StoredChatLine[];
  } catch {
    return [];
  }
}

// pure: the transcript column format. every line attributed, her own
// sends marked as hers, never anonymized away.
export function serializeChatLog(lines: StoredChatLine[]): string {
  return lines
    // a line with no message is not a take-home line, whoever said it
    .filter((l) => (l.message || "").trim().length > 0)
    .map((l) => `${(l.speaker || "").trim()}: ${(l.message || "").trim()}`)
    .join("\n");
}

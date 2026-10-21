export type PlatformType = 'zoom' | 'google_meet' | 'teams' | 'custom';
export type MeetingStatus = 'scheduled' | 'bot_joining' | 'bot_in_meeting' | 'completed' | 'failed';
export type AttendanceMethod = 'chat_message' | 'google_form' | 'custom' | 'none';
export type CaptureType = 'capture' | 'ask';
export type CaptureStatus = 'pending' | 'captured' | 'answered' | 'not_found' | 'meeting_skipped';
export type MessageTrigger = 'on_join' | 'after_delay' | 'scheduled';
export type MessageSentStatus = 'pending' | 'sent' | 'failed';
export type AuthMode = 'anonymous' | 'signed_in' | 'registration';
export type BreakoutRoomMode = 'auto_accept_all_invites' | 'join_main_room' | 'join_specific_room';

// profile/persona — sandboxed identity per context (hackathon vs professional vs personal)
export interface Profile {
  id: string;
  name: string;                    // internal slug, e.g. "hackathon", "professional"
  display_name: string;            // name shown in meetings (may not be legal name)
  email: string | null;            // email for zoom registration/webinars
  context: string | null;          // instructions/context for this persona
  shared_memory: boolean;          // whether this profile shares global memory or is sandboxed
  is_default: boolean;
  // voice config (from memorium_schema.sql + voice_config_schema.sql)
  voice_id?: string | null;        // TTS provider voice ID
  tone?: string;                   // emotional register
  initiative_level?: string;       // passive | active | proactive
  question_style?: string;         // direct | indirect | socratic
  language_preference?: string;    // ISO code
  // fist — rhythmic signature (morse code operator concept)
  fist_score?: number;             // 0-1, overall fist quality
  fist_timing_variation?: number;  // 0-1, timing variance
  fist_rhythm_stability?: number;  // 0-1, rhythm consistency over time
  fist_pause_pattern?: string;     // deliberate | natural | minimal | none
  fist_startup_pattern?: string;   // immediate | brief_pause | deliberate_opening
  fist_turn_entry_pattern?: string; // immediate | beat | filler | deliberate
  cadence_wpm?: number;            // 80-220, words per minute
  prosody?: number;                // 0-1, 0=monotone, 1=highly expressive
  created_at?: string;
  updated_at?: string;
}

export interface Meeting {
  id: string;
  title: string;
  platform: PlatformType | string;
  join_url: string;
  start_time: string;
  end_time?: string | null;
  status: MeetingStatus;
  bot_id?: string | null;
  instruction?: string | null;
  join_delay_minutes: number;
  // which gate she waits at: minutes after start (delay, the default) or
  // until N participants are already inside (participants)
  join_trigger?: JoinTrigger;
  join_after_participants?: number | null;
  attendance_method: AttendanceMethod;
  attendance_form_url?: string | null;
  zoom_user_email?: string | null;
  prixie_attended: boolean;
  attendance_messages_sent: boolean;
  transcript_id?: string | null;
  profile_id?: string | null;       // which persona to use
  camera_off: boolean;              // bot joins with camera off (default true)
  mic_off: boolean;                 // bot joins with mic off (default true, until voice feature ready)
  auth_mode: AuthMode;              // anonymous (default), signed_in, registration
  breakout_room_mode?: BreakoutRoomMode | null;
  breakout_room_id?: string | null;
  voice_override?: VoiceOverride | null;  // per-meeting voice config override
  localization?: LocalizationConfig | null;  // per-meeting locale & language config
  created_at?: string;
  updated_at?: string;
}

export interface CreateMeetingInput {
  title: string;
  platform?: PlatformType | string;
  join_url: string;
  start_time: string;
  end_time?: string;
  instruction?: string;
  join_delay_minutes?: number;
  join_trigger?: JoinTrigger;
  join_after_participants?: number | null;
  attendance_method?: AttendanceMethod;
  attendance_form_url?: string;
  zoom_user_email?: string;
  profile_id?: string;
  camera_off?: boolean;
  mic_off?: boolean;
  auth_mode?: AuthMode;
  breakout_room_mode?: BreakoutRoomMode;
  breakout_room_id?: string;
  voice_override?: VoiceOverride;
  localization?: LocalizationConfig;
}

export interface UpdateMeetingInput {
  title?: string;
  platform?: PlatformType | string;
  join_url?: string;
  start_time?: string;
  end_time?: string;
  status?: MeetingStatus;
  bot_id?: string | null;
  instruction?: string;
  join_delay_minutes?: number;
  join_trigger?: JoinTrigger;
  join_after_participants?: number | null;
  attendance_method?: AttendanceMethod;
  attendance_form_url?: string;
  zoom_user_email?: string;
  prixie_attended?: boolean;
  attendance_messages_sent?: boolean;
  transcript_id?: string | null;
  profile_id?: string | null;
  camera_off?: boolean;
  mic_off?: boolean;
  auth_mode?: AuthMode;
  voice_override?: VoiceOverride | null;
  localization?: LocalizationConfig | null;
}

// sync result of one calendar source pull: how many meetings joined the
// pipeline this pass. status is "success", "skipped" (no credentials), or
// the error message.
export interface SyncState {
  status: string;
  meetings_synced: number;
  last_synced_at: string;
}

// a per-meeting voice override: the profile's voice, but tuned for this
// one meeting (demo pitch vs classroom).
export interface VoiceOverride {
  voice?: string;
  speed?: number;
  pitch?: number;
  style?: string;
}

// localization for a meeting: the hinglish rule lives here too. latin
// script, phonetically written, no devanagari.
export interface LocalizationConfig {
  language?: string;
  accent?: string;
  transliteration?: "latin-phonetic";
}

// the join gate. "delay": she joins N minutes after start (the existing
// behavior). "participants": she holds until N humans are already in the
// room, which is the join-when-it-actually-started trigger: a scheduled
// time is a promise, a participant count is a fact.
export type JoinTrigger = "delay" | "participants";

export interface CaptureRequest {
  id: string;
  meeting_id: string;
  title: string;
  type: CaptureType;
  keywords?: string[];
  notes?: string | null;
  question?: string | null;
  answer?: string | null;
  captured_content?: string | null;
  captured_chat_links?: string[] | null;
  captured_screenshot_url?: string | null;
  screenshot_enabled: boolean;
  check_chat: boolean;
  redeem?: boolean | null;
  status: CaptureStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCaptureRequestInput {
  meeting_id?: string;
  title: string;
  type: CaptureType;
  keywords?: string[];
  notes?: string;
  question?: string;
  screenshot_enabled?: boolean;
  check_chat?: boolean;
  redeem?: boolean;
}

export interface UpdateCaptureRequestInput {
  title?: string;
  type?: CaptureType;
  keywords?: string[];
  notes?: string;
  question?: string;
  answer?: string;
  captured_content?: string;
  captured_chat_links?: string[];
  captured_screenshot_url?: string;
  screenshot_enabled?: boolean;
  check_chat?: boolean;
  status?: CaptureStatus;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  full_transcript: string;
  summary?: string | null;
  action_items?: string[] | null;
  captured_items?: Record<string, unknown> | null;
  created_at?: string;
}

export interface AttendanceMessage {
  id: string;
  meeting_id: string;
  message_text: string;
  trigger: MessageTrigger;
  sent_at?: string | null;
  sent_status: MessageSentStatus;
  created_at?: string;
}

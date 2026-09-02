export type Platform = 'zoom' | 'google_meet' | 'teams';

export type MeetingStatus = 'scheduled' | 'joining' | 'in_meeting' | 'completed' | 'failed';

export type AttendanceMethod = 'chat_message' | 'google_form' | 'custom' | 'none';

export type CaptureType = 'capture' | 'ask';

export type BreakoutMode = 'auto_accept_all_invites' | 'join_main_room' | 'join_specific_room';

export type CapturedItemType = 'code' | 'link' | 'form' | 'screenshot' | 'answer' | 'text';

export interface CaptureRequest {
  id?: string;
  meeting_id?: string;
  title: string;
  type: CaptureType;
  keywords: string[];
  notes?: string;
  check_chat: boolean;
  screenshot: boolean;
  question?: string;
}

export interface CapturedItem {
  id: string;
  meeting_id: string;
  meeting_title?: string;
  title: string;
  type: CapturedItemType;
  value: string;
  context?: string;
  timestamp: string;
  confidence?: number;
  screenshot_url?: string;
}

export interface TranscriptEntry {
  id: string;
  meeting_id: string;
  speaker: string;
  text: string;
  timestamp: string;
  is_highlight?: boolean;
}

export interface ChatMessage {
  id: string;
  meeting_id: string;
  sender: string;
  message: string;
  timestamp: string;
  has_link?: boolean;
  link_url?: string;
}

export interface Meeting {
  id: string;
  title: string;
  platform: Platform;
  join_url: string;
  start_time: string;
  end_time?: string;
  status: MeetingStatus;
  join_delay_minutes: number;
  use_different_email: boolean;
  zoom_user_email?: string;
  attendance_method: AttendanceMethod;
  attendance_message?: string;
  attendance_form_url?: string;
  instruction?: string;
  breakout_mode?: BreakoutMode;
  breakout_room_id?: string;
  bot_id?: string;
  created_at: string;
  capture_requests?: CaptureRequest[];
  captured_items?: CapturedItem[];
  transcript?: TranscriptEntry[];
  chat_messages?: ChatMessage[];
  transcript_count?: number;
}

export interface DeployConfig {
  join_url: string;
  platform: Platform;
  title: string;
  start_time: string;
  end_time?: string;
  join_delay_minutes: number;
  use_different_email: boolean;
  zoom_user_email?: string;
  attendance_method: AttendanceMethod;
  attendance_message?: string;
  attendance_form_url?: string;
  capture_requests: CaptureRequest[];
  breakout_mode?: BreakoutMode;
  breakout_room_id?: string;
  instruction?: string;
}

export interface QuickStats {
  meetings_attended: number;
  items_captured: number;
  total_transcripts: number;
}

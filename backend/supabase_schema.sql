-- Schema for prixie (personal meeting proxy agent)
-- Database: Supabase (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 0. Profiles Table (personas — sandboxed identity per context)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT,
    context TEXT,
    shared_memory BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- insert a default profile
INSERT INTO public.profiles (name, display_name, context, is_default)
VALUES ('default', 'prixie', 'default prixie persona', TRUE)
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 1. Meetings Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('zoom', 'google_meet', 'teams', 'custom')),
    join_url TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'bot_joining', 'bot_in_meeting', 'completed', 'failed')),
    bot_id TEXT,
    instruction TEXT,
    join_delay_minutes INTEGER DEFAULT 2,
    attendance_method TEXT DEFAULT 'none' CHECK (attendance_method IN ('chat_message', 'google_form', 'custom', 'none')),
    attendance_form_url TEXT,
    zoom_user_email TEXT,
    prixie_attended BOOLEAN DEFAULT FALSE,
    attendance_messages_sent BOOLEAN DEFAULT FALSE,
    transcript_id UUID,
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    camera_off BOOLEAN DEFAULT TRUE,
    mic_off BOOLEAN DEFAULT TRUE,
    auth_mode TEXT DEFAULT 'anonymous' CHECK (auth_mode IN ('anonymous', 'signed_in', 'registration')),
    breakout_room_mode TEXT CHECK (breakout_room_mode IN ('auto_accept_all_invites', 'join_main_room', 'join_specific_room')),
    breakout_room_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Capture Requests Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.capture_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('capture', 'ask')),
    keywords TEXT[] DEFAULT '{}',
    notes TEXT,
    question TEXT,
    answer TEXT,
    captured_content TEXT,
    captured_chat_links TEXT[] DEFAULT '{}',
    captured_screenshot_url TEXT,
    screenshot_enabled BOOLEAN DEFAULT FALSE,
    check_chat BOOLEAN DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'answered', 'not_found', 'meeting_skipped')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. Transcripts Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    full_transcript TEXT,
    summary TEXT,
    action_items TEXT[] DEFAULT '{}',
    captured_items JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.meetings 
    ADD CONSTRAINT fk_meetings_transcript 
    FOREIGN KEY (transcript_id) REFERENCES public.transcripts(id) 
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- -----------------------------------------------------------------------------
-- 4. Attendance Messages Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    trigger TEXT CHECK (trigger IN ('on_join', 'after_delay', 'scheduled')),
    sent_at TIMESTAMPTZ,
    sent_status TEXT DEFAULT 'pending' CHECK (sent_status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. Profile Memory Table (per-profile context/memory persistence)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(profile_id, key)
);

-- shared global memory (not tied to any profile)
CREATE TABLE IF NOT EXISTS public.global_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_start_time ON public.meetings(start_time);
CREATE INDEX IF NOT EXISTS idx_meetings_bot_id ON public.meetings(bot_id);
CREATE INDEX IF NOT EXISTS idx_meetings_profile ON public.meetings(profile_id);
CREATE INDEX IF NOT EXISTS idx_capture_requests_meeting ON public.capture_requests(meeting_id);
CREATE INDEX IF NOT EXISTS idx_capture_requests_status ON public.capture_requests(status);
CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON public.transcripts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendance_messages_meeting ON public.attendance_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_profile_memory_profile ON public.profile_memory(profile_id);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_meetings_updated_at ON public.meetings;
CREATE TRIGGER set_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_capture_requests_updated_at ON public.capture_requests;
CREATE TRIGGER set_capture_requests_updated_at BEFORE UPDATE ON public.capture_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_profile_memory_updated_at ON public.profile_memory;
CREATE TRIGGER set_profile_memory_updated_at BEFORE UPDATE ON public.profile_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS Policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_meetings" ON public.meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_capture_requests" ON public.capture_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_transcripts" ON public.transcripts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_attendance_messages" ON public.attendance_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_profile_memory" ON public.profile_memory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_global_memory" ON public.global_memory FOR ALL USING (true) WITH CHECK (true);

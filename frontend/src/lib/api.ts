import type {
  Meeting,
  CapturedItem,
  TranscriptEntry,
  CaptureRequest,
  DeployConfig,
  QuickStats
} from './types';

const INITIAL_MEETINGS: Meeting[] = [
  {
    id: 'm-101',
    title: 'hackathon kickoff & setup guide',
    platform: 'zoom',
    join_url: 'https://zoom.us/j/9876543210',
    start_time: new Date(Date.now() - 3600000 * 2).toISOString(),
    end_time: new Date(Date.now() - 3600000 * 1).toISOString(),
    status: 'completed',
    join_delay_minutes: 2,
    use_different_email: true,
    zoom_user_email: 'bot-guest@prixie.internal',
    attendance_method: 'chat_message',
    attendance_message: 'present! checking in for team prixie.',
    instruction: 'grab any access codes shared during the call for claiming hackathon credits and submission form url',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    bot_id: 'recall-bot-884920',
    capture_requests: [
      {
        id: 'cr-1',
        title: 'hackathon access code',
        type: 'capture',
        keywords: ['access code', 'claim code', 'credit code', 'code is'],
        notes: 'look for 8-character code shared during sponsorship presentation',
        check_chat: true,
        screenshot: true
      },
      {
        id: 'cr-2',
        title: 'project submission form',
        type: 'capture',
        keywords: ['forms.gle', 'typeform', 'submission link', 'submit here'],
        notes: 'any link where we need to upload our repository URL',
        check_chat: true,
        screenshot: false
      }
    ],
    captured_items: [
      {
        id: 'ci-1',
        meeting_id: 'm-101',
        meeting_title: 'hackathon kickoff & setup guide',
        title: 'hackathon access code',
        type: 'code',
        value: 'PRIXIE-BUILD-2026-X9',
        context: 'speaker sarah mentioned: "the access code for cloud credits is PRIXIE-BUILD-2026-X9, also dropped in chat."',
        timestamp: new Date(Date.now() - 3600000 * 1.8).toISOString(),
        confidence: 0.98,
        screenshot_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80'
      },
      {
        id: 'ci-2',
        meeting_id: 'm-101',
        meeting_title: 'hackathon kickoff & setup guide',
        title: 'project submission form',
        type: 'form',
        value: 'https://forms.gle/prixie2026hackathonSubmit',
        context: 'chat message from host: "please submit final projects here before midnight: https://forms.gle/prixie2026hackathonSubmit"',
        timestamp: new Date(Date.now() - 3600000 * 1.2).toISOString(),
        confidence: 0.99
      }
    ],
    transcript: [
      {
        id: 'tr-1',
        meeting_id: 'm-101',
        speaker: 'sarah (host)',
        text: 'welcome everyone to the 2026 summer hackathon kickoff! we are super excited to have 150 teams building today.',
        timestamp: '00:02:15'
      },
      {
        id: 'tr-2',
        meeting_id: 'm-101',
        speaker: 'sarah (host)',
        text: 'before we dive into judging criteria, let me share the sponsor access code. the access code for cloud credits is PRIXIE-BUILD-2026-X9, also dropped in chat.',
        timestamp: '00:08:42',
        is_highlight: true
      },
      {
        id: 'tr-3',
        meeting_id: 'm-101',
        speaker: 'alex (mentor)',
        text: 'if anyone has questions regarding recall.ai integration or webhook setup, feel free to join breakout room 3 later.',
        timestamp: '00:15:30'
      },
      {
        id: 'tr-4',
        meeting_id: 'm-101',
        speaker: 'sarah (host)',
        text: 'reminder that project submission closes at 11:50 pm tonight. please submit final projects here before midnight: https://forms.gle/prixie2026hackathonSubmit',
        timestamp: '00:45:10',
        is_highlight: true
      }
    ],
    chat_messages: [
      {
        id: 'cm-1',
        meeting_id: 'm-101',
        sender: 'prixie (proxy)',
        message: 'present! checking in for team prixie.',
        timestamp: '00:02:05'
      },
      {
        id: 'cm-2',
        meeting_id: 'm-101',
        sender: 'sarah (host)',
        message: 'cloud credit code: PRIXIE-BUILD-2026-X9',
        timestamp: '00:08:50',
        has_link: false
      },
      {
        id: 'cm-3',
        meeting_id: 'm-101',
        sender: 'sarah (host)',
        message: 'submission link: https://forms.gle/prixie2026hackathonSubmit',
        timestamp: '00:45:12',
        has_link: true,
        link_url: 'https://forms.gle/prixie2026hackathonSubmit'
      }
    ]
  },
  {
    id: 'm-102',
    title: 'product architecture & agent design sync',
    platform: 'google_meet',
    join_url: 'https://meet.google.com/abc-defg-hij',
    start_time: new Date(Date.now() - 900000).toISOString(),
    status: 'in_meeting',
    join_delay_minutes: 1,
    use_different_email: false,
    attendance_method: 'chat_message',
    attendance_message: 'prixie in attendance.',
    instruction: 'monitor discussion on tanstack start deployment options and capture any doc links or figging links',
    created_at: new Date(Date.now() - 1200000).toISOString(),
    bot_id: 'recall-bot-991204',
    capture_requests: [
      {
        id: 'cr-3',
        title: 'shared document links',
        type: 'capture',
        keywords: ['docs.google.com', 'notion.so', 'figma.com', 'github.com'],
        notes: 'capture any reference link pasted in meeting chat or spoken in call',
        check_chat: true,
        screenshot: false
      }
    ],
    captured_items: [
      {
        id: 'ci-3',
        meeting_id: 'm-102',
        meeting_title: 'product architecture & agent design sync',
        title: 'shared document links',
        type: 'link',
        value: 'https://docs.google.com/document/d/1prixie-architecture-spec-2026/edit',
        context: 'chat from marcus: "here is the current draft for tanstack start server function integration: https://docs.google.com/document/d/1prixie-architecture-spec-2026/edit"',
        timestamp: new Date(Date.now() - 300000).toISOString(),
        confidence: 0.95
      }
    ],
    transcript: [
      {
        id: 'tr-10',
        meeting_id: 'm-102',
        speaker: 'marcus (tech lead)',
        text: 'let us walk through the tanstack start router setup and full-stack routing configuration.',
        timestamp: '00:01:20'
      },
      {
        id: 'tr-11',
        meeting_id: 'm-102',
        speaker: 'elena (design)',
        text: 'the visual system uses semantic tokens: canvas, ink, ribbon, leaf, border, accent. keep it clean and document-focused.',
        timestamp: '00:04:45',
        is_highlight: true
      },
      {
        id: 'tr-12',
        meeting_id: 'm-102',
        speaker: 'marcus (tech lead)',
        text: 'i am pasting the spec doc in chat now. please check page 4 for the deployment flow.',
        timestamp: '00:08:10'
      }
    ],
    chat_messages: [
      {
        id: 'cm-10',
        meeting_id: 'm-102',
        sender: 'marcus',
        message: 'https://docs.google.com/document/d/1prixie-architecture-spec-2026/edit',
        timestamp: '00:08:15',
        has_link: true,
        link_url: 'https://docs.google.com/document/d/1prixie-architecture-spec-2026/edit'
      }
    ]
  },
  {
    id: 'm-103',
    title: 'all-hands quarterly roadmap review',
    platform: 'teams',
    join_url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_123456789',
    start_time: new Date(Date.now() + 3600000 * 3).toISOString(),
    end_time: new Date(Date.now() + 3600000 * 4).toISOString(),
    status: 'scheduled',
    join_delay_minutes: 2,
    use_different_email: false,
    attendance_method: 'chat_message',
    attendance_message: 'present on behalf of engineering team.',
    instruction: 'listen for q4 priorities and ask what the timeline for public API release is if Q&A opens',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    capture_requests: [
      {
        id: 'cr-4',
        title: 'ask API timeline in chat',
        type: 'ask',
        keywords: ['q&a', 'questions', 'api release'],
        question: 'what is the targeted quarter for opening the external agent API?',
        notes: 'ask when the host opens the floor for questions',
        check_chat: true,
        screenshot: false
      }
    ],
    captured_items: [],
    transcript: [],
    chat_messages: []
  },
  {
    id: 'm-104',
    title: 'community office hours & feedback session',
    platform: 'zoom',
    join_url: 'https://zoom.us/j/1122334455',
    start_time: new Date(Date.now() + 86400000).toISOString(),
    status: 'scheduled',
    join_delay_minutes: 0,
    use_different_email: true,
    zoom_user_email: 'community-proxy@prixie.internal',
    attendance_method: 'google_form',
    attendance_form_url: 'https://forms.gle/communityAttendanceForm2026',
    breakout_mode: 'auto_accept_all_invites',
    instruction: 'fill out attendance form URL on join, capture any discord or telegram community links',
    created_at: new Date(Date.now() - 14400000).toISOString(),
    capture_requests: [
      {
        id: 'cr-5',
        title: 'community links',
        type: 'capture',
        keywords: ['discord.gg', 't.me', 'slack.com'],
        notes: 'grab permanent invite link',
        check_chat: true,
        screenshot: false
      }
    ],
    captured_items: [],
    transcript: [],
    chat_messages: []
  }
];

// Helper to get stored meetings from localStorage if available, or initialize
function getStoredMeetings(): Meeting[] {
  if (typeof window === 'undefined') return INITIAL_MEETINGS;
  try {
    const data = localStorage.getItem('prixie_meetings');
    if (!data) {
      localStorage.setItem('prixie_meetings', JSON.stringify(INITIAL_MEETINGS));
      return INITIAL_MEETINGS;
    }
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading localStorage meetings:', e);
    return INITIAL_MEETINGS;
  }
}

function saveStoredMeetings(meetings: Meeting[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('prixie_meetings', JSON.stringify(meetings));
  } catch (e) {
    console.error('Error saving localStorage meetings:', e);
  }
}

// API functions wrapping backend endpoints with localStorage fallback
export async function fetchMeetings(): Promise<Meeting[]> {
  try {
    const res = await fetch('/api/meetings');
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.meetings || [];
    }
  } catch (e) {
    // API endpoint not live or offline — fall back smoothly
  }
  return getStoredMeetings();
}

export async function fetchMeetingById(id: string): Promise<Meeting | null> {
  try {
    const res = await fetch(`/api/meetings/${id}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // fall back
  }
  const meetings = getStoredMeetings();
  return meetings.find((m) => m.id === id) || null;
}

export async function createMeeting(meetingData: Partial<Meeting>): Promise<Meeting> {
  let created: Meeting | null = null;
  try {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meetingData)
    });
    if (res.ok) {
      created = await res.json();
    }
  } catch (e) {
    // fall back
  }

  if (!created) {
    const meetings = getStoredMeetings();
    const newId = `m-${Date.now().toString().slice(-4)}`;
    created = {
      id: newId,
      title: meetingData.title || 'untitled meeting',
      platform: meetingData.platform || 'zoom',
      join_url: meetingData.join_url || '',
      start_time: meetingData.start_time || new Date().toISOString(),
      end_time: meetingData.end_time,
      status: 'scheduled',
      join_delay_minutes: meetingData.join_delay_minutes ?? 2,
      use_different_email: !!meetingData.use_different_email,
      zoom_user_email: meetingData.zoom_user_email,
      attendance_method: meetingData.attendance_method || 'chat_message',
      attendance_message: meetingData.attendance_message || 'present!',
      attendance_form_url: meetingData.attendance_form_url,
      instruction: meetingData.instruction,
      breakout_mode: meetingData.breakout_mode,
      breakout_room_id: meetingData.breakout_room_id,
      created_at: new Date().toISOString(),
      capture_requests: meetingData.capture_requests || [],
      captured_items: [],
      transcript: [],
      chat_messages: []
    };
    meetings.unshift(created);
    saveStoredMeetings(meetings);
  }

  return created;
}

export async function deployPrixie(meetingId: string, config?: Partial<DeployConfig>): Promise<{ success: boolean; meeting: Meeting; bot_id: string }> {
  try {
    const res = await fetch(`/api/deploy/${meetingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {})
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {
    // fall back
  }

  // Fallback deploy state update
  const meetings = getStoredMeetings();
  const idx = meetings.findIndex((m) => m.id === meetingId);
  const botId = `recall-bot-${Math.floor(100000 + Math.random() * 900000)}`;
  
  if (idx !== -1) {
    meetings[idx] = {
      ...meetings[idx],
      status: 'joining',
      bot_id: botId,
      ...(config ? {
        title: config.title || meetings[idx].title,
        join_url: config.join_url || meetings[idx].join_url,
        platform: config.platform || meetings[idx].platform,
        start_time: config.start_time || meetings[idx].start_time,
        join_delay_minutes: config.join_delay_minutes ?? meetings[idx].join_delay_minutes,
        attendance_method: config.attendance_method || meetings[idx].attendance_method,
        attendance_message: config.attendance_message || meetings[idx].attendance_message,
        instruction: config.instruction || meetings[idx].instruction,
        capture_requests: config.capture_requests || meetings[idx].capture_requests
      } : {})
    };
    saveStoredMeetings(meetings);
    return { success: true, meeting: meetings[idx], bot_id: botId };
  }

  throw new Error(`Meeting ${meetingId} not found`);
}

export async function addCaptureRequest(meetingId: string, captureRequest: CaptureRequest): Promise<CaptureRequest> {
  const reqWithId = { ...captureRequest, id: captureRequest.id || `cr-${Date.now().toString().slice(-4)}`, meeting_id: meetingId };
  try {
    const res = await fetch(`/api/meetings/${meetingId}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqWithId)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    // fall back
  }

  const meetings = getStoredMeetings();
  const meeting = meetings.find((m) => m.id === meetingId);
  if (meeting) {
    meeting.capture_requests = [...(meeting.capture_requests || []), reqWithId];
    saveStoredMeetings(meetings);
  }
  return reqWithId;
}

export async function fetchTranscript(meetingId: string): Promise<TranscriptEntry[]> {
  try {
    const res = await fetch(`/api/transcripts/${meetingId}`);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : data.transcript || [];
    }
  } catch (e) {
    // fall back
  }

  const meeting = await fetchMeetingById(meetingId);
  return meeting?.transcript || [];
}

export async function fetchAllCaptures(): Promise<CapturedItem[]> {
  const meetings = await fetchMeetings();
  const allCaptures: CapturedItem[] = [];
  
  for (const m of meetings) {
    if (m.captured_items) {
      for (const item of m.captured_items) {
        allCaptures.push({
          ...item,
          meeting_title: item.meeting_title || m.title
        });
      }
    }
  }

  return allCaptures.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function fetchQuickStats(): Promise<QuickStats> {
  const meetings = await fetchMeetings();
  let itemsCaptured = 0;
  let totalTranscripts = 0;
  let meetingsAttended = 0;

  for (const m of meetings) {
    if (m.status === 'completed' || m.status === 'in_meeting') {
      meetingsAttended++;
    }
    itemsCaptured += m.captured_items?.length || 0;
    totalTranscripts += m.transcript?.length || m.transcript_count || 0;
  }

  return {
    meetings_attended: meetingsAttended,
    items_captured: itemsCaptured,
    total_transcripts: totalTranscripts
  };
}

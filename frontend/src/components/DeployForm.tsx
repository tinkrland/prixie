import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type {
  Platform,
  AttendanceMethod,
  BreakoutMode,
  CaptureRequest,
  DeployConfig
} from '../lib/types';
import { createMeeting, deployPrixie } from '../lib/api';
import { CaptureRequestForm } from './CaptureRequestForm';

export function DeployForm() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Meeting details
  const [joinUrl, setJoinUrl] = useState('');
  const [platform, setPlatform] = useState<Platform>('zoom');
  const [title, setTitle] = useState('');
  
  // default start_time to 15 mins from now in local ISO string for datetime-local picker
  const now = new Date();
  now.setMinutes(now.getMinutes() + 15);
  const defaultStartTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState('');

  // 2. Join behavior
  const [joinDelay, setJoinDelay] = useState<number>(2);
  const [useDifferentEmail, setUseDifferentEmail] = useState(false);
  const [zoomUserEmail, setZoomUserEmail] = useState('');

  // 3. Attendance
  const [attendanceMethod, setAttendanceMethod] = useState<AttendanceMethod>('chat_message');
  const [attendanceMessage, setAttendanceMessage] = useState('present!');
  const [attendanceFormUrl, setAttendanceFormUrl] = useState('');

  // 4. What to capture
  const [captureRequests, setCaptureRequests] = useState<CaptureRequest[]>([
    {
      title: 'access codes & credits',
      type: 'capture',
      keywords: ['access code', 'claim code', 'credits', 'discount'],
      notes: 'listen for codes spoken or pasted in chat',
      check_chat: true,
      screenshot: true
    }
  ]);
  const [showAddRequestForm, setShowAddRequestForm] = useState(false);

  // 5. Breakout rooms (Zoom only)
  const [breakoutMode, setBreakoutMode] = useState<BreakoutMode>('auto_accept_all_invites');
  const [breakoutRoomId, setBreakoutRoomId] = useState('');

  // 6. Instruction
  const [instruction, setInstruction] = useState('grab any access codes shared during the call for claiming hackathon credits');

  const handleAddCaptureRequest = (req: CaptureRequest) => {
    setCaptureRequests([...captureRequests, req]);
    setShowAddRequestForm(false);
  };

  const handleRemoveCaptureRequest = (index: number) => {
    setCaptureRequests(captureRequests.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinUrl.trim() || !title.trim()) {
      setError('please provide both meeting url and title.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const config: DeployConfig = {
        join_url: joinUrl.trim(),
        platform,
        title: title.trim(),
        start_time: new Date(startTime).toISOString(),
        end_time: endTime ? new Date(endTime).toISOString() : undefined,
        join_delay_minutes: Number(joinDelay),
        use_different_email: useDifferentEmail,
        zoom_user_email: useDifferentEmail ? zoomUserEmail.trim() : undefined,
        attendance_method: attendanceMethod,
        attendance_message: attendanceMethod === 'chat_message' ? attendanceMessage.trim() : undefined,
        attendance_form_url: attendanceMethod === 'google_form' ? attendanceFormUrl.trim() : undefined,
        capture_requests: captureRequests,
        breakout_mode: platform === 'zoom' ? breakoutMode : undefined,
        breakout_room_id: platform === 'zoom' && breakoutMode === 'join_specific_room' ? breakoutRoomId.trim() : undefined,
        instruction: instruction.trim()
      };

      // Create meeting & deploy
      const meeting = await createMeeting(config);
      await deployPrixie(meeting.id, config);

      navigate({ to: '/meeting/$id', params: { id: meeting.id } });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'failed to deploy prixie to meeting.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 font-mono">
      {error && (
        <div className="border border-primary bg-primary/10 p-3 text-xs text-primary">
          [error]: {error}
        </div>
      )}

      {/* 1. Meeting Details */}
      <section className="border border-primary bg-card p-5">
        <div className="border-b border-primary pb-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            01 // meeting details
          </span>
          <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
            where is prixie going?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="md:col-span-2">
            <label className="block text-muted-foreground mb-1">meeting url *</label>
            <input
              type="url"
              required
              placeholder="https://zoom.us/j/123456789 or https://meet.google.com/abc-def-ghi"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              className="w-full border border-primary bg-background p-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">platform *</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="zoom">zoom</option>
              <option value="google_meet">google meet</option>
              <option value="teams">microsoft teams</option>
            </select>
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">meeting title *</label>
            <input
              type="text"
              required
              placeholder="e.g. hackathon rules & credit distribution"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-primary bg-background p-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">start time *</label>
            <input
              type="datetime-local"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-muted-foreground mb-1">end time (optional)</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </section>

      {/* 2. Join Behavior */}
      <section className="border border-primary bg-card p-5">
        <div className="border-b border-primary pb-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            02 // join behavior
          </span>
          <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
            timing & identity
          </h2>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-muted-foreground mb-1">
              join delay (minutes after start time)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={joinDelay}
              onChange={(e) => setJoinDelay(Number(e.target.value))}
              className="w-32 border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="ml-2 text-[11px] text-muted-foreground">
              (default 2 mins allows organizers to open room first)
            </span>
          </div>

          <div className="border-t border-primary/20 pt-3">
            <label className="flex items-center gap-2 cursor-pointer font-bold text-foreground">
              <input
                type="checkbox"
                checked={useDifferentEmail}
                onChange={(e) => setUseDifferentEmail(e.target.checked)}
                className="accent-primary"
              />
              join with a different email address (for zoom webinars / registration)
            </label>

            {useDifferentEmail && (
              <div className="mt-2 pl-6">
                <label className="block text-muted-foreground mb-1">custom email address</label>
                <input
                  type="email"
                  placeholder="proxy-guest@prixie.internal"
                  value={zoomUserEmail}
                  onChange={(e) => setZoomUserEmail(e.target.value)}
                  className="w-full max-w-md border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Attendance */}
      <section className="border border-primary bg-card p-5">
        <div className="border-b border-primary pb-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            03 // attendance marking
          </span>
          <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
            how should prixie check in?
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-muted-foreground mb-1">attendance method</label>
            <select
              value={attendanceMethod}
              onChange={(e) => setAttendanceMethod(e.target.value as AttendanceMethod)}
              className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="chat_message">chat message (post in room chat on join)</option>
              <option value="google_form">google form / URL (submit form link)</option>
              <option value="custom">custom action</option>
              <option value="none">none (silent presence)</option>
            </select>
          </div>

          {attendanceMethod === 'chat_message' && (
            <div>
              <label className="block text-muted-foreground mb-1">attendance chat message</label>
              <input
                type="text"
                placeholder="e.g. present! checking in."
                value={attendanceMessage}
                onChange={(e) => setAttendanceMessage(e.target.value)}
                className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {attendanceMethod === 'google_form' && (
            <div>
              <label className="block text-muted-foreground mb-1">attendance form url</label>
              <input
                type="url"
                placeholder="https://forms.gle/..."
                value={attendanceFormUrl}
                onChange={(e) => setAttendanceFormUrl(e.target.value)}
                className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      </section>

      {/* 4. What to Capture */}
      <section className="border border-primary bg-card p-5">
        <div className="flex flex-wrap items-center justify-between border-b border-primary pb-2 mb-4 gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              04 // what to capture
            </span>
            <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
              capture requests ({captureRequests.length})
            </h2>
          </div>

          {!showAddRequestForm && (
            <button
              type="button"
              onClick={() => setShowAddRequestForm(true)}
              className="border border-primary bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              + add request
            </button>
          )}
        </div>

        {showAddRequestForm && (
          <div className="mb-4">
            <CaptureRequestForm
              onAdd={handleAddCaptureRequest}
              onCancel={() => setShowAddRequestForm(false)}
            />
          </div>
        )}

        {captureRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            no capture requests added yet. click above to specify keywords, links, or questions for prixie to watch for.
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            {captureRequests.map((req, idx) => (
              <div key={idx} className="border border-primary/40 bg-background p-3">
                <div className="flex items-center justify-between border-b border-primary/20 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="bg-primary px-1.5 py-0.5 text-[10px] uppercase font-bold text-primary-foreground">
                      {req.type}
                    </span>
                    <span className="font-bold text-foreground">{req.title}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCaptureRequest(idx)}
                    className="text-muted-foreground hover:text-primary"
                  >
                    [remove]
                  </button>
                </div>

                {req.keywords.length > 0 && (
                  <div className="mt-2 text-[11px]">
                    <span className="text-muted-foreground">keywords: </span>
                    <span className="font-mono text-primary">{req.keywords.join(', ')}</span>
                  </div>
                )}

                {req.type === 'ask' && req.question && (
                  <div className="mt-1 text-[11px] font-semibold text-foreground">
                    question: "{req.question}"
                  </div>
                )}

                {req.notes && (
                  <div className="mt-1 text-[11px] text-muted-foreground italic">
                    note: {req.notes}
                  </div>
                )}

                <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground border-t border-primary/10 pt-1">
                  <span>scan chat: {req.check_chat ? 'yes' : 'no'}</span>
                  <span>take screenshot: {req.screenshot ? 'yes' : 'no'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Breakout Rooms (Zoom only) */}
      {platform === 'zoom' && (
        <section className="border border-primary bg-card p-5">
          <div className="border-b border-primary pb-2 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              05 // breakout rooms (zoom)
            </span>
            <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
              breakout room handling
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-muted-foreground mb-1">breakout room mode</label>
              <select
                value={breakoutMode}
                onChange={(e) => setBreakoutMode(e.target.value as BreakoutMode)}
                className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="auto_accept_all_invites">auto-accept all room invites</option>
                <option value="join_main_room">stay in main room</option>
                <option value="join_specific_room">join specific breakout room ID</option>
              </select>
            </div>

            {breakoutMode === 'join_specific_room' && (
              <div>
                <label className="block text-muted-foreground mb-1">room ID / name</label>
                <input
                  type="text"
                  placeholder="e.g. room 3"
                  value={breakoutRoomId}
                  onChange={(e) => setBreakoutRoomId(e.target.value)}
                  className="w-full border border-primary bg-background p-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* 6. Concrete Instruction */}
      <section className="border border-primary bg-card p-5">
        <div className="border-b border-primary pb-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            06 // core instruction
          </span>
          <h2 className="text-base font-bold uppercase tracking-tight text-foreground">
            what is prixie's concrete info goal?
          </h2>
        </div>

        <div className="text-xs">
          <textarea
            rows={3}
            placeholder="e.g. grab any access codes shared during the call for claiming hackathon credits"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="w-full border border-primary bg-background p-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            free-form goal for prixie's real-time transcript processor and chat handler.
          </p>
        </div>
      </section>

      {/* 7. Deploy Button */}
      <div className="border-t-2 border-primary pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="w-full border-2 border-primary bg-primary py-3 font-mono text-sm font-black uppercase tracking-widest text-primary-foreground transition-transform hover:opacity-95 active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? 'deploying prixie...' : 'deploy prixie to meeting →'}
        </button>
      </div>
    </form>
  );
}

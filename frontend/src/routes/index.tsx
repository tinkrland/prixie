import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { Meeting, CapturedItem, QuickStats } from '../lib/types';
import { fetchMeetings, fetchAllCaptures, fetchQuickStats } from '../lib/api';
import { MeetingCard } from '../components/MeetingCard';
import { CapturedItemCard } from '../components/CapturedItemCard';

export const Route = createFileRoute('/')({
  component: DashboardPage
});

function DashboardPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [captures, setCaptures] = useState<CapturedItem[]>([]);
  const [stats, setStats] = useState<QuickStats>({
    meetings_attended: 0,
    items_captured: 0,
    total_transcripts: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [mList, cList, qStats] = await Promise.all([
          fetchMeetings(),
          fetchAllCaptures(),
          fetchQuickStats()
        ]);
        setMeetings(mList);
        setCaptures(cList);
        setStats(qStats);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Upcoming meetings (scheduled, sorted by start_time ascending)
  const upcomingMeetings = meetings
    .filter((m) => m.status === 'scheduled' || m.status === 'joining' || m.status === 'in_meeting')
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Recent captured items (last 4)
  const recentCaptures = captures.slice(0, 4);

  return (
    <div className="space-y-8 font-mono lowercase">
      {/* Intro section */}
      <div className="border border-primary bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary pb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              overview // personal dashboard
            </span>
            <h1 className="mt-1 text-xl sm:text-2xl font-black uppercase text-foreground">
              prixie meeting control
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              your personal agent that joins meetings, checks in, captures data, and returns with full context.
            </p>
          </div>

          <Link
            to="/deploy"
            className="border-2 border-primary bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-primary-foreground transition-transform hover:opacity-95 active:scale-95"
          >
            + deploy to new meeting
          </Link>
        </div>

        {/* Quick Stats Grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-primary bg-background p-4 text-center sm:text-left">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              meetings attended
            </div>
            <div className="mt-2 font-mono text-3xl font-black text-primary">
              {loading ? '...' : stats.meetings_attended}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">active & completed sessions</div>
          </div>

          <div className="border border-primary bg-background p-4 text-center sm:text-left">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              items captured
            </div>
            <div className="mt-2 font-mono text-3xl font-black text-leaf">
              {loading ? '...' : stats.items_captured}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">codes, links & form responses</div>
          </div>

          <div className="border border-primary bg-background p-4 text-center sm:text-left">
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              total transcripts
            </div>
            <div className="mt-2 font-mono text-3xl font-black text-foreground">
              {loading ? '...' : stats.total_transcripts}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">diarized speaker statements</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Upcoming Meetings & Recent Captures */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Meetings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-primary pb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              upcoming & active meetings ({upcomingMeetings.length})
            </h2>
            <Link to="/meetings" className="text-xs text-primary underline">
              all meetings →
            </Link>
          </div>

          {loading ? (
            <div className="border border-primary p-6 text-center text-xs text-muted-foreground">
              loading upcoming meetings...
            </div>
          ) : upcomingMeetings.length === 0 ? (
            <div className="border border-primary bg-card p-6 text-center text-xs text-muted-foreground">
              <p>no scheduled or active meetings right now.</p>
              <Link
                to="/deploy"
                className="mt-3 inline-block border border-primary bg-primary px-3 py-1 font-bold text-primary-foreground"
              >
                deploy prixie now
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Captures */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-primary pb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              recent captured items ({recentCaptures.length})
            </h2>
            <Link to="/captures" className="text-xs text-primary underline">
              all captures →
            </Link>
          </div>

          {loading ? (
            <div className="border border-primary p-6 text-center text-xs text-muted-foreground">
              loading captured items...
            </div>
          ) : recentCaptures.length === 0 ? (
            <div className="border border-primary bg-card p-6 text-center text-xs text-muted-foreground">
              no captured items yet. configure capture requests when deploying prixie.
            </div>
          ) : (
            <div className="space-y-4">
              {recentCaptures.map((item) => (
                <CapturedItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

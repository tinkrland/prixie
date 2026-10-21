import { google } from "npm:googleapis@144";
import { createMeeting, listMeetings } from "./supabase.ts";
import { SyncState, PlatformType } from "../types.ts";
import {
  syncOutlookCalendar,
  syncAppleCalendar,
  type MeetingCandidate,
} from "./calendar_sync.ts";

export class CalendarService {
  private getOAuth2Client() {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI") || "https://prixie.yourdomain.com/webhooks/google-calendar";
    const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("prixie: missing google calendar credentials in environment variables");
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  /**
   * Sync upcoming calendar events from Google Calendar into Supabase meetings table.
   */
  // the other two pull calendars, same flow as google: candidates ->
  // dedupe against existing join urls -> createMeeting. the meeting
  // manager deploys her for the joined meetings like any other source.
  async syncPullCalendars(): Promise<SyncState[]> {
    const states: SyncState[] = [];

    // google is oauth in this service's own client (the connector path);
    // outlook + apple read their credentials from env. a source without
    // its credentials is skipped, not faked.
    if (Deno.env.get("OUTLOOK_ACCESS_TOKEN")) {
      states.push(await this.syncCandidates("outlook", () =>
        syncOutlookCalendar(Deno.env.get("OUTLOOK_ACCESS_TOKEN")!)));
    }
    const caldavUrl = Deno.env.get("APPLE_CALDAV_URL");
    const caldavUser = Deno.env.get("APPLE_CALDAV_USERNAME");
    const caldavPass = Deno.env.get("APPLE_CALDAV_PASSWORD");
    if (caldavUrl && caldavUser && caldavPass) {
      states.push(await this.syncCandidates("apple", () =>
        syncAppleCalendar(caldavUrl, caldavUser, caldavPass)));
    }

    return states;
  }

  // shared candidate -> meeting flow for the pull adapters. mirrors the
  // google path: dedupe by join url, then create.
  private async syncCandidates(
    source: string,
    pull: () => Promise<MeetingCandidate[]>,
  ): Promise<SyncState> {
    const syncedAt = new Date().toISOString();
    try {
      const candidates = await pull();
      const existing = await listMeetings();
      const existingUrls = new Set(existing.map(m => m.join_url.toLowerCase().trim()));

      let newCount = 0;
      for (const c of candidates) {
        if (!c.join_url) continue;
        if (existingUrls.has(c.join_url.toLowerCase().trim())) continue;
        await createMeeting({
          title: c.title,
          platform: (c.platform as PlatformType) || this.detectPlatform(c.join_url) as PlatformType,
          join_url: c.join_url,
          start_time: c.start_time,
          join_delay_minutes: 2,
          attendance_method: "none",
        });
        existingUrls.add(c.join_url.toLowerCase().trim());
        newCount++;
      }
      console.log(`prixie: synced ${newCount} new meetings from ${source} calendar`);
      return { status: "success", meetings_synced: newCount, last_synced_at: syncedAt };
    } catch (err: any) {
      console.error(`prixie: failed to sync ${source} calendar:`, err);
      return { status: `error: ${err.message}`, meetings_synced: 0, last_synced_at: syncedAt };
    }
  }

  async syncGoogleCalendar(): Promise<SyncState> {
    const oauth2Client = this.getOAuth2Client();

    if (!oauth2Client) {
      return {
        status: "skipped",
        meetings_synced: 0,
        last_synced_at: new Date().toISOString(),
      };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const now = new Date();
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: nextWeek.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = res.data.items || [];
      let newCount = 0;

      // Existing meetings to check for duplicates
      const existingMeetings = await listMeetings();
      const existingUrls = new Set(existingMeetings.map((m) => m.join_url.toLowerCase().trim()));

      for (const event of events) {
        if (!event.summary || event.status === "cancelled") continue;

        const joinUrl = this.extractMeetingUrl(event);
        if (!joinUrl) continue;

        const normalizedUrl = joinUrl.toLowerCase().trim();
        if (existingUrls.has(normalizedUrl)) continue; // Already added

        const startTime = event.start?.dateTime || event.start?.date;
        const endTime = event.end?.dateTime || event.end?.date;
        if (!startTime) continue;

        const platform = this.detectPlatform(joinUrl);

        await createMeeting({
          title: event.summary,
          platform: platform,
          join_url: joinUrl,
          start_time: startTime,
          end_time: endTime || undefined,
          instruction: event.description || undefined,
          join_delay_minutes: 2,
          attendance_method: "none",
        });

        existingUrls.add(normalizedUrl);
        newCount++;
      }

      console.log(`prixie: synced ${newCount} new meetings from google calendar`);

      return {
        status: "success",
        meetings_synced: newCount,
        last_synced_at: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("prixie: failed to sync google calendar:", err);
      return {
        status: `error: ${err.message}`,
        meetings_synced: 0,
        last_synced_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Extract meeting URL from Google Calendar event fields.
   */
  private extractMeetingUrl(event: any): string | null {
    // Check hangoutLink (Google Meet)
    if (event.hangoutLink) {
      return event.hangoutLink;
    }

    // Check entryPoints in conferenceData
    if (event.conferenceData?.entryPoints) {
      for (const entry of event.conferenceData.entryPoints) {
        if (entry.uri && (entry.entryPointType === "video" || entry.uri.includes("http"))) {
          return entry.uri;
        }
      }
    }

    // Check location
    if (event.location && this.isValidMeetingUrl(event.location)) {
      return this.extractUrlFromString(event.location);
    }

    // Check description for zoom/meet/teams links
    if (event.description) {
      const url = this.extractUrlFromString(event.description);
      if (url && this.isValidMeetingUrl(url)) {
        return url;
      }
    }

    return null;
  }

  private isValidMeetingUrl(str: string): boolean {
    const lower = str.toLowerCase();
    return (
      lower.includes("meet.google.com") ||
      lower.includes("zoom.us") ||
      lower.includes("teams.microsoft.com") ||
      lower.includes("teams.live.com")
    );
  }

  private extractUrlFromString(text: string): string | null {
    const urlRegex = /(https?:\/\/[^\s"'<>]+)/gi;
    const matches = text.match(urlRegex);
    if (!matches) return null;

    for (const match of matches) {
      if (this.isValidMeetingUrl(match)) {
        return match;
      }
    }

    return matches[0] || null;
  }

  private detectPlatform(url: string): PlatformType {
    const lower = url.toLowerCase();
    if (lower.includes("zoom.us")) return "zoom";
    if (lower.includes("meet.google.com")) return "google_meet";
    if (lower.includes("teams.microsoft.com")) return "teams";
    return "custom";
  }
}

export const calendarService = new CalendarService();

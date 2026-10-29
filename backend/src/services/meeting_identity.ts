// who the meeting's counterpart is, through the connection anchors
// (anne, oct 29 2026). the second surface to declare its platform.
//
// a display name is never a handle. the only real handle a meeting row
// carries is `zoom_user_email` (the owner's calendar event exposes it,
// and the attendance flows fill it): that email resolves through the
// anchors, either under the meeting's own platform or under `email`.
// both matching is the point of anchors: the same person on zoom and in
// mail is ONE connection, and her anchored memory carries across.
//
// no email, an ambiguous email, or no anchor config = an honest
// unanchored scope. the head then treats the meeting's facts as
// stranger context, which is the safe direction.

import { resolveConnection, type Connection } from "./connections.ts";
import { scopeFor, type BuiltScope } from "./memory_scope.ts";

export interface MeetingIdentity {
  platform: string;
  // the meeting's declared platform, lowercased ("zoom", "google_meet", ...)
  scope: BuiltScope;
  host_connection: Connection | null;
  host_email: string | null;
  // the anchor plus where it came from, so a receipt can say "known
  // through mail" instead of pretending certainty
  resolved_via: "meeting_platform" | "email" | null;
}

export function meetingIdentity(
  meeting: {
    platform?: string | null;
    zoom_user_email?: string | null;
    host_name?: string | null;
  },
  connections?: Connection[],
): MeetingIdentity {
  const platform = (meeting.platform || "").trim().toLowerCase() || "unknown";
  const email = (meeting.zoom_user_email || "").trim();

  if (email) {
    // first the meeting's own platform namespace, then the email one:
    // an anchor stored once (under email) still recognizes the zoom row
    const onPlatform = resolveConnection(platform, email, connections);
    if (onPlatform.connection) {
      return {
        platform,
        scope: scopeFor(platform, email, { connections, resolved: onPlatform.connection }),
        host_connection: onPlatform.connection,
        host_email: email,
        resolved_via: "meeting_platform",
      };
    }
    const viaEmail = resolveConnection("email", email, connections);
    if (viaEmail.connection) {
      return {
        platform,
        scope: scopeFor(platform, email, { connections, resolved: viaEmail.connection }),
        host_connection: viaEmail.connection,
        host_email: email,
        resolved_via: "email",
      };
    }
  }

  // unanchored: the scope still declares the surface (so the head knows
  // which platform this is), the connection stays honest-null. an
  // ambiguous email carries its verdict through.
  const ambiguous = email
    && resolveConnection("email", email, connections).reason === "ambiguous";
  return {
    platform,
    scope: scopeFor(platform, email || null, {
      connections,
      anchorHint: ambiguous ? "ambiguous" : undefined,
    }),
    host_connection: null,
    host_email: email || null,
    resolved_via: null,
  };
}

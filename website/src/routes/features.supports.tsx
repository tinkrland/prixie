import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CameraMark,
  DiscordMark,
  SlackMark,
  TicketMark,
} from "../components/prixy/platform-icons";
import {
  BigHeading,
  BriefNote,
  CellGrid,
  DocBox,
  MetaRow,
  NumberedList,
  StripLabel,
  Tag,
} from "../components/prixy/document-parts";

export const Route = createFileRoute("/features/supports")({
  head: () => ({
    meta: [
      { title: "supports | what prixy can join" },
      {
        name: "description",
        content:
          "the meeting and event platforms prixy targets, the ways it obtains a join link, and how account switching works.",
      },
      { property: "og:title", content: "supports | what prixy can join" },
      {
        property: "og:description",
        content: "meeting platforms, event registration, join paths, and identity handling.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportsPage,
});

/*
  platform coverage mirrors the reference build: bot-service platforms get full
  transcript and chat support, browser-automation platforms get the same capture
  logic through a heavier join path. icons use the monochrome marks, not brand
  colours, so the sheet stays in one ink.
*/
const meetingPlatforms = [
  {
    marker: "bot path",
    icon: <CameraMark size={15} />,
    title: "zoom",
    description:
      "scheduled meetings and webinars: passcodes, registration links, q&a panels, and breakout rooms.",
  },
  {
    marker: "bot path",
    icon: <CameraMark size={15} />,
    title: "google meet",
    description:
      "calendar-native links, waiting rooms, and in-call chat capture for workspace and personal accounts.",
  },
  {
    marker: "bot path",
    icon: <CameraMark size={15} />,
    title: "microsoft teams",
    description: "org-invited meetings and guest joins where external participants are permitted.",
  },
  {
    marker: "bot path",
    icon: <SlackMark size={15} />,
    title: "slack huddles",
    description:
      "huddles and scheduled calls inside workspaces you have connected, joined when they go live.",
  },
  {
    marker: "bot path",
    icon: <CameraMark size={15} />,
    title: "cisco webex",
    description: "meetings and webinars through the same bot path as zoom and meet.",
  },
  {
    marker: "browser path",
    icon: <DiscordMark size={15} />,
    title: "discord",
    description:
      "voice channels and stage events, including calls that only exist once someone opens them live in a server.",
  },
  {
    marker: "browser path",
    icon: <CameraMark size={15} />,
    title: "bluejeans and ringcentral",
    description:
      "anything with a browser join url. automation clicks join, enters your name, and captures audio from the tab.",
  },
  {
    marker: "stream",
    icon: <CameraMark size={15} />,
    title: "live streams",
    description:
      "streamed sessions with live chat, where the capture target is usually something dropped in the chat itself.",
  },
];

const eventPlatforms = [
  {
    marker: "pre-registration",
    icon: <TicketMark size={15} />,
    title: "luma",
    description:
      "prixy registers for the event, keeps the confirmation, and grabs the join link when it is released to attendees.",
  },
  {
    marker: "pre-registration",
    icon: <TicketMark size={15} />,
    title: "eventbrite",
    description:
      "ticket-style registration flows: prixy signs up, holds the ticket, and follows the online-event link it unlocks.",
  },
  {
    marker: "scheduling",
    icon: <TicketMark size={15} />,
    title: "calendly",
    description:
      "booking links sync into the calendar, so a session scheduled through calendly is discovered and attended automatically.",
  },
];

const joinPaths = [
  {
    title: "link already in your calendar",
    description:
      "the invite exists and carries a join url. calendar sync discovers the event and prixy attends at the scheduled time.",
  },
  {
    title: "assigned meeting, link arrives later",
    description:
      "you are on the invite list but the link is emailed beforehand. prixy watches the connected inbox and picks up the url when it lands.",
  },
  {
    title: "call starts live in discord or slack",
    description:
      "there is no link at all until someone opens a channel call. prixy stays present in the space and joins when the call goes live.",
  },
  {
    title: "pre-registration on luma or eventbrite",
    description:
      "gated sessions require signing up first. prixy completes the registration, receives the confirmation, and keeps the resulting link.",
  },
  {
    title: "booked through calendly",
    description:
      "a calendly booking lands on your calendar with its conferencing link attached. sync picks it up like any other event.",
  },
  {
    title: "link dropped live during a window",
    description:
      "the url is posted in a discord channel, slack thread, or forum at some point during an announced period. prixy watches that surface for the window and joins the moment it appears.",
  },
];

const identity = [
  {
    title: "logged-in sessions",
    description:
      "prixy uses your authenticated session for a platform so it enters rooms restricted to signed-in members.",
  },
  {
    title: "account switching",
    description:
      "pick which profile attends. a work identity for the client call, a personal one for the community event.",
  },
  {
    title: "profile matching",
    description:
      "display name, avatar, and org affiliation are matched to what the meeting expects, so the room sees a coherent participant.",
  },
  {
    title: "multiple inboxes",
    description:
      "connect several email accounts. prixy watches each one for invites, confirmations, and late-arriving links.",
  },
  {
    title: "multiple calendars",
    description:
      "google, outlook, and other calendars sync together, so a meeting on any of them is discovered without forwarding invites.",
  },
  {
    title: "quiet defaults",
    description:
      "camera off and mic off by default, with a configurable join delay so prixy arrives after the host has opened the room.",
  },
];

/*
  the coverage matrix is a plain table because the data is genuinely tabular;
  forcing it into the cell grid would hide the per-platform differences.
*/
const coverage = [
  { platform: "zoom", path: "bot", transcript: "yes", chat: "send + receive", breakout: "yes" },
  { platform: "google meet", path: "bot", transcript: "yes", chat: "send + receive", breakout: "n/a" },
  { platform: "microsoft teams", path: "bot", transcript: "yes", chat: "send + receive", breakout: "n/a" },
  { platform: "slack huddles", path: "bot", transcript: "yes", chat: "send only", breakout: "n/a" },
  { platform: "cisco webex", path: "bot", transcript: "yes", chat: "no chat", breakout: "n/a" },
  { platform: "discord", path: "browser", transcript: "yes", chat: "via browser", breakout: "n/a" },
  { platform: "bluejeans", path: "browser", transcript: "yes", chat: "via browser", breakout: "n/a" },
  { platform: "ringcentral", path: "browser", transcript: "yes", chat: "via browser", breakout: "n/a" },
];

function SupportsPage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "supports" },
          { label: "parent", value: "features" },
          { label: "issue", value: "002" },
          { label: "status", value: "target coverage" },
        ]}
      />

      <BriefNote>
        coverage is defined per platform and per join path, because getting into the room is
        usually harder than being in it. everything listed here is target coverage for the preview
        product.
      </BriefNote>

      <StripLabel>supports</StripLabel>
      <BigHeading>
        where it
        <br />
        can show up.
      </BigHeading>

      <DocBox label="meeting platforms">
        <CellGrid items={meetingPlatforms} />
      </DocBox>

      <DocBox label="event and scheduling platforms">
        <CellGrid items={eventPlatforms} />
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          event platforms are where the link comes from, not where the call happens. prixy handles
          the registration or booking, then attends wherever the event actually takes place.
        </p>
      </DocBox>

      <DocBox label="how it joins">
        <NumberedList items={joinPaths} />
      </DocBox>

      <DocBox label="coverage matrix">
        <div className="overflow-x-auto border border-primary">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-primary">
                {["platform", "join path", "transcript", "chat", "breakouts"].map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2 text-[10px] font-normal uppercase tracking-[0.18em] text-primary opacity-60"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverage.map((row, rowIndex) => (
                <tr
                  key={row.platform}
                  className={rowIndex < coverage.length - 1 ? "border-b border-primary" : ""}
                >
                  <td className="px-3 py-2 text-xs font-semibold text-primary">{row.platform}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.path}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.transcript}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.chat}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.breakout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          the bot path is a managed meeting-bot service; the browser path is headless browser
          automation with audio capture. the capture logic on top is identical either way.
        </p>
      </DocBox>

      <DocBox label="accounts and identity">
        <CellGrid items={identity} columns={2} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Tag>logged-in access</Tag>
          <Tag>account switching</Tag>
          <Tag>profile matching</Tag>
          <Tag>multiple inboxes</Tag>
          <Tag>multiple calendars</Tag>
          <Tag>camera and mic off</Tag>
        </div>
      </DocBox>

      <DocBox label="not supported" filled>
        <p className="text-sm leading-relaxed">
          rooms where automated participants are prohibited, sessions requiring physical presence
          or identity verification prixy cannot legitimately satisfy, and any space where you have
          not granted it access.
        </p>
      </DocBox>

      <div className="flex flex-wrap gap-4 border-x border-b border-primary px-4 py-4">
        <Link
          to="/features"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          back to features
        </Link>
        <Link
          to="/features/capabilities"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          capability sheet
        </Link>
      </div>
    </div>
  );
}

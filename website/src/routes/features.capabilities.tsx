import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BigHeading,
  BriefNote,
  CellGrid,
  DocBox,
  MetaRow,
  NumberedList,
  StripLabel,
} from "../components/prixy/document-parts";

export const Route = createFileRoute("/features/capabilities")({
  head: () => ({
    meta: [
      { title: "capabilities | what prixy can actually do" },
      {
        name: "description",
        content:
          "a detailed capability sheet covering registration, attendance, listening, asking, retrieval, and retention.",
      },
      { property: "og:title", content: "capabilities | what prixy can actually do" },
      {
        property: "og:description",
        content: "the detailed capability sheet for a personal presence proxy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CapabilitiesPage,
});

const beforeSession = [
  {
    title: "registration",
    description:
      "fills in the registration form on platforms like luma or eventbrite, handles confirmation steps, and stores the resulting join link.",
  },
  {
    title: "link sourcing",
    description:
      "finds the join url wherever it lives: calendar sync, a connected inbox, a discord or slack channel, or a forum thread watched during the event window.",
  },
  {
    title: "scheduling",
    description:
      "resolves the correct start time across timezones and reserves the slot, including a configurable join delay so prixy arrives after the host opens the room.",
  },
  {
    title: "briefing",
    description:
      "takes your goal, keywords to watch, and prepared questions as the instruction set for that specific session.",
  },
];

const duringSession = [
  {
    title: "joins as you",
    description:
      "enters with the profile and display identity you selected for that room, camera off and mic off, handling waiting rooms and passcodes.",
  },
  {
    title: "goal-aware listening",
    description:
      "checks every live transcript chunk against your capture requests. keyword matches are saved immediately, with who said it, when, and the surrounding sentence.",
  },
  {
    title: "chat monitoring",
    description:
      "watches meeting chat in real time for links, access codes, and form urls, and captures them as they appear.",
  },
  {
    title: "asks and follows up",
    description:
      "raises prepared questions at an appropriate moment and pushes once if the answer is vague.",
  },
  {
    title: "marks attendance",
    description:
      "sends a presence message in chat, fills out an attendance form, or follows a custom method you define.",
  },
  {
    title: "handles breakout rooms",
    description:
      "auto-accepts breakout invites, joins a specific room you named, or stays in the main session.",
  },
];

const afterSession = [
  {
    title: "the short answer",
    description:
      "the requested detail arrives first, in one line, without a wall of surrounding context.",
  },
  {
    title: "honest gaps",
    description:
      "if the information never surfaced, prixy says so instead of inventing a plausible answer.",
  },
  {
    title: "diarized transcript",
    description:
      "the full transcript comes back with speaker labels, so you can see who said what, not just what was said.",
  },
  {
    title: "hinglish readable",
    description:
      "when speakers mix hindi and english, the transcript stays in latin script, phonetically written, so you read it without switching scripts.",
  },
  {
    title: "optional source",
    description:
      "transcripts and materials stay available for inspection and are deletable at any time.",
  },
];

function CapabilitiesPage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "capabilities" },
          { label: "parent", value: "features" },
          { label: "issue", value: "001" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        capabilities are grouped by when they happen: before the session, during it, and after it.
        the split matters because each stage has different failure modes.
      </BriefNote>

      <StripLabel>capabilities</StripLabel>
      <BigHeading>
        what it
        <br />
        can do.
      </BigHeading>

      <DocBox label="before the session">
        <NumberedList items={beforeSession} />
      </DocBox>

      <DocBox label="during the session">
        <CellGrid items={duringSession} columns={2} />
      </DocBox>

      <DocBox label="after the session">
        <NumberedList items={afterSession} />
      </DocBox>

      <div className="flex flex-wrap gap-4 border-x border-b border-primary px-4 py-4">
        <Link
          to="/features"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          back to features
        </Link>
        <Link
          to="/features/supports"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          supported platforms
        </Link>
      </div>
    </div>
  );
}

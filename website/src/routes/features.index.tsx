import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/features/")({
  head: () => ({
    meta: [
      { title: "features | what prixy does" },
      {
        name: "description",
        content:
          "the capabilities, the stack behind them, and the considerations that shape how prixy attends on your behalf.",
      },
      { property: "og:title", content: "features | what prixy does" },
      {
        property: "og:description",
        content: "capabilities, stack, and considerations for a delegated presence proxy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeaturesPage,
});

const capabilities = [
  {
    marker: "01",
    title: "register and attend",
    description:
      "completes pre-registration on luma or eventbrite, then joins the session itself, autonomously, with camera and mic off.",
  },
  {
    marker: "02",
    title: "listen with intent",
    description:
      "follows the live transcript against your capture requests, not a generic summary. keyword matches are saved with context as they happen.",
  },
  {
    marker: "03",
    title: "watch the chat",
    description:
      "monitors meeting chat in real time and grabs links, access codes, and form urls the moment they are posted.",
  },
  {
    marker: "04",
    title: "ask prepared questions",
    description:
      "waits for an appropriate opening, asks what you specified, and captures the response.",
  },
  {
    marker: "05",
    title: "mark attendance",
    description:
      "sends a chat message, fills an attendance form, or uses a custom method where a platform enforces presence.",
  },
  {
    marker: "06",
    title: "retrieve precisely",
    description:
      "returns the decision, deadline, price, availability date, answer, or live promo code you asked for, with the full diarized transcript retained as source.",
  },
];

const stack = [
  {
    title: "session interface layer",
    description:
      "per-provider adapters that know how to join, mute, chat, and leave a given meeting platform.",
  },
  {
    title: "instruction model",
    description:
      "your goal, your prepared questions, and your reporting preferences stored as a single structured brief.",
  },
  {
    title: "live listening pipeline",
    description:
      "streaming transcription with goal-aware extraction, so relevant moments are flagged as they happen.",
  },
  {
    title: "identity and account layer",
    description:
      "signed-in profiles, account switching, and multiple linked inboxes so prixy appears as the right you.",
  },
  {
    title: "retention store",
    description:
      "transcripts and artefacts held privately, with user-controlled deletion as the default expectation.",
  },
  {
    title: "delivery layer",
    description:
      "the short answer first, delivered to where you already are, with the source one click away.",
  },
];

const considerations = [
  {
    title: "consent and disclosure",
    description:
      "some rooms and some jurisdictions require participants to be told a proxy is present and recording. prixy is built to disclose rather than hide.",
  },
  {
    title: "platform rules",
    description:
      "not every provider permits automated participants. supported coverage is defined per platform instead of promised broadly.",
  },
  {
    title: "identity boundaries",
    description:
      "acting as your presence is a delegation, not an impersonation. what prixy may say on your behalf stays explicitly scoped.",
  },
  {
    title: "accuracy over volume",
    description:
      "a confident wrong answer is worse than an honest gap, so unresolved requests are reported as unresolved.",
  },
  {
    title: "data retention",
    description:
      "recordings are sensitive by default. retention is opt-in per session and deletable at any point.",
  },
  {
    title: "portability",
    description:
      "provider adapters are kept replaceable so the product is not locked to a single meeting vendor.",
  },
];

function FeaturesPage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "features" },
          { label: "sections", value: "capabilities · stack · considerations" },
          { label: "issue", value: "001" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        tell prixy where to go and what you need. this sheet covers what it can do, what sits behind
        those abilities, and the constraints that shape them.
      </BriefNote>

      <StripLabel>features</StripLabel>
      <BigHeading>
        go to the
        <br />
        meeting.
        <br />
        get the thing.
      </BigHeading>

      <DocBox label="capabilities">
        <CellGrid items={capabilities} />
        <div className="mt-4">
          <Link
            to="/features/capabilities"
            className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
          >
            full capability sheet
          </Link>
        </div>
      </DocBox>

      <DocBox label="stack">
        <NumberedList items={stack} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Tag>adapters</Tag>
          <Tag>transcription</Tag>
          <Tag>goal extraction</Tag>
          <Tag>identity</Tag>
          <Tag>private retention</Tag>
        </div>
      </DocBox>

      <DocBox label="considerations">
        <CellGrid items={considerations} columns={2} />
      </DocBox>

      <div className="flex flex-wrap gap-4 border-x border-b border-primary px-4 py-4">
        <Link
          to="/features/supports"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          supported platforms
        </Link>
        <Link
          to="/roadmap"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          roadmap
        </Link>
      </div>
    </div>
  );
}

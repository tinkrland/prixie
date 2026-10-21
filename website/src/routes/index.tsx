import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BigHeading,
  BriefNote,
  CellGrid,
  DocBox,
  MetaRow,
  StripLabel,
} from "../components/prixy/document-parts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "prixy | your personal presence proxy" },
      {
        name: "description",
        content:
          "prixy goes to the meeting, event, or session and brings back exactly what you needed.",
      },
      { property: "og:title", content: "prixy | your personal presence proxy" },
      {
        property: "og:description",
        content: "you don't always need a meeting summary. sometimes you need someone to go.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const theLoop = [
  {
    marker: "01",
    title: "register",
    description: "handles sign-up and pre-registration when a session requires it.",
  },
  {
    marker: "02",
    title: "attend",
    description: "joins the supported call as your delegated presence at the right time.",
  },
  {
    marker: "03",
    title: "listen",
    description: "follows the session against the specific goal you gave it.",
  },
  {
    marker: "04",
    title: "ask",
    description: "raises your prepared questions when the moment is appropriate.",
  },
  {
    marker: "05",
    title: "retrieve",
    description: "captures the decision, price, date, code, or answer you asked for.",
  },
  {
    marker: "06",
    title: "return",
    description: "sends back the answer, and keeps the transcript if you want the full context.",
  },
];

const notThese = [
  {
    title: "not a meeting summariser.",
    description:
      "a summary explains a room you were already in. prixy is for rooms you never entered.",
  },
  {
    title: "not a corporate notetaker.",
    description:
      "it is your personal instance with your instructions, not a bot invited to every calendar event.",
  },
  {
    title: "not another inbox.",
    description:
      "you get the specific thing you asked for. the source material stays available but optional.",
  },
];

function Index() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "index" },
          { label: "type", value: "personal presence proxy" },
          { label: "issue", value: "001" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        prixy is a personal ai proxy that can show up to things on your behalf and bring back exactly
        what you needed. this document explains what it does, why it exists, and what it can join.
      </BriefNote>

      <StripLabel>the proxy</StripLabel>

      <BigHeading>
        you don&apos;t need
        <br />
        a recap.
        <br />
        you need
        <br />
        someone to go.
      </BigHeading>

      <StripLabel>introduction</StripLabel>
      <div className="grid grid-cols-1 gap-6 border-x border-b border-primary px-4 py-6 md:grid-cols-2">
        <p className="text-base leading-relaxed">
          tell prixy where to go and what you need from it. it handles the presence, then returns the
          answer.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          being somewhere and knowing something are two different things. prixy separates them, so an
          hour of attendance can become one line of information.
        </p>
      </div>

      <DocBox label="the presence loop">
        <CellGrid items={theLoop} />
      </DocBox>

      <DocBox label="what prixy is not">
        <CellGrid items={notThese} />
      </DocBox>

      <DocBox label="one request in, one answer out" filled>
        <p className="text-lg leading-snug">
          &ldquo;go to this event and find the promo code they announce during the live session.&rdquo;
        </p>
        <p className="mt-4 font-display text-4xl font-black uppercase tracking-tight">
          promo code: example20
        </p>
      </DocBox>

      <div className="flex flex-wrap gap-4 border-x border-b border-primary px-4 py-4">
        <Link
          to="/features"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          read the features
        </Link>
        <Link
          to="/features/supports"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          what it can join
        </Link>
        <Link
          to="/purpose"
          className="border-b border-primary text-[10px] uppercase tracking-[0.12em] text-primary"
        >
          why it exists
        </Link>
      </div>
    </div>
  );
}

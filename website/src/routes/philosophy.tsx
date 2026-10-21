import { createFileRoute } from "@tanstack/react-router";
import {
  BigHeading,
  BriefNote,
  DocBox,
  MetaRow,
  NumberedList,
  Prose,
  PullQuote,
  StripLabel,
} from "../components/prixy/document-parts";

export const Route = createFileRoute("/philosophy")({
  head: () => ({
    meta: [
      { title: "philosophy | presence is expensive" },
      {
        name: "description",
        content:
          "prixy separates being somewhere from knowing something, and treats attention as the scarce resource.",
      },
      { property: "og:title", content: "philosophy | presence is expensive" },
      {
        property: "og:description",
        content: "being somewhere and knowing something are two different things.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PhilosophyPage,
});

const principles = [
  {
    title: "attendance is a cost, not a value",
    description:
      "an hour spent in a call is an hour spent. the information is the value, and it rarely needs the hour.",
  },
  {
    title: "more output is not more help",
    description:
      "summaries, recaps, highlights and action items can each become another thing to process.",
  },
  {
    title: "the stated need comes first",
    description:
      "if you already know what you need, the correct answer is that thing, not general coverage of everything said.",
  },
];

function PhilosophyPage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "philosophy" },
          { label: "type", value: "position" },
          { label: "issue", value: "005" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        position sheet. the reasoning behind the anti-recap stance, kept separate from features.
      </BriefNote>

      <StripLabel>philosophy</StripLabel>
      <BigHeading>
        presence is
        <br />
        expensive.
      </BigHeading>

      <DocBox label="the wrong assumption">
        <Prose>
          <p>
            productivity software assumed the hardest part of a meeting is remembering what
            happened. so we got summaries, recaps, action items, highlights and key takeaways.
          </p>
          <p>
            sometimes those are useful. but if you sat through the meeting, you already know what
            happened. you do not need software to explain your own experience back to you.
          </p>
          <PullQuote>
            a summarizer asks what happened. a proxy asks what you needed from what happened.
          </PullQuote>
        </Prose>
      </DocBox>

      <DocBox label="principles">
        <NumberedList items={principles} />
      </DocBox>

      <DocBox label="delegate the presence" filled>
        <p className="text-sm leading-relaxed">
          you do not always need to spend an hour of your life acquiring one piece of information.
          you do not always need to read a summary of something you already experienced. sometimes
          you just need someone to go.
        </p>
      </DocBox>
    </div>
  );
}

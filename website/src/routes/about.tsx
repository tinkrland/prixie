import { createFileRoute } from "@tanstack/react-router";
import {
  BigHeading,
  BriefNote,
  CellGrid,
  DocBox,
  MetaRow,
  Prose,
  PullQuote,
  StripLabel,
} from "../components/prixy/document-parts";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "about prixy | a personal proxy" },
      {
        name: "description",
        content:
          "prixy is a personal presence proxy: your instance, your instructions, quietly present where you aren't.",
      },
      { property: "og:title", content: "about prixy | a personal proxy" },
      {
        property: "og:description",
        content: "a personal proxy, not another productivity app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

/*
  the three cells below restate the positioning as constraints rather than
  marketing claims, because "what it is not" is the clearest way to explain a
  proxy to someone who has only ever used meeting summarizers.
*/
const positioning = [
  {
    marker: "01",
    title: "personal, not corporate",
    description:
      "prixy is your instance. it is not a shared bot invited to every calendar event in an organisation.",
  },
  {
    marker: "02",
    title: "instructed, not automatic",
    description:
      "you decide what it should care about and what it should bring back. nothing is reported by default.",
  },
  {
    marker: "03",
    title: "inspectable, not opaque",
    description:
      "the underlying transcript stays available when you want full context. otherwise it stays out of the way.",
  },
];

function AboutPage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "about" },
          { label: "type", value: "product note" },
          { label: "issue", value: "002" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        about sheet. where prixy came from and what kind of thing it is meant to be.
      </BriefNote>

      <StripLabel>about</StripLabel>
      <BigHeading>
        a personal
        <br />
        proxy.
      </BigHeading>

      <DocBox label="origin">
        <Prose>
          <p>
            prixy started from a simple question: what if an assistant actually went somewhere
            instead of telling you about somewhere you already went?
          </p>
          <p>
            the result is a personal agent that can act as your presence across supported digital
            spaces. it can register. it can attend. it can listen. it can ask. it can retrieve. and
            it can come back with exactly what you needed.
          </p>
          <PullQuote>quietly present where you aren't.</PullQuote>
          <p>
            no forced recap. no mandatory dashboard. no assumption that every meeting needs to
            become content. just a proxy.
          </p>
        </Prose>
      </DocBox>

      <DocBox label="positioning">
        <CellGrid items={positioning} />
      </DocBox>
    </div>
  );
}

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

export const Route = createFileRoute("/purpose")({
  head: () => ({
    meta: [
      { title: "purpose | why prixy exists" },
      {
        name: "description",
        content:
          "prixy exists to separate attendance from information, so an hour in a call can become one line of answer.",
      },
      { property: "og:title", content: "purpose | why prixy exists" },
      {
        property: "og:description",
        content: "delegate the presence, keep the information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PurposePage,
});

const intentions = [
  {
    title: "give back the hour",
    description:
      "attendance is the expensive part. if the value of a session is one detail, the hour should be optional.",
  },
  {
    title: "answer the actual question",
    description:
      "you already know what you need. prixy is built around that stated need, not around generic coverage.",
  },
  {
    title: "reduce processing load",
    description:
      "a recap is another document to read. one line of answer is not.",
  },
];

function PurposePage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "purpose" },
          { label: "type", value: "intent statement" },
          { label: "issue", value: "001" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        purpose sheet. what prixy is for, stated plainly, before any feature list.
      </BriefNote>

      <StripLabel>purpose</StripLabel>
      <BigHeading>
        delegate
        <br />
        the presence.
      </BigHeading>

      <DocBox label="statement">
        <Prose>
          <p>
            prixy exists because presence and information got bundled together. to know one thing
            said in a call, you have to give up the whole hour the call takes.
          </p>
          <PullQuote>go on my behalf. bring back the thing i asked for.</PullQuote>
          <p>
            the purpose is not to process more meetings. it is to make attending optional when
            attending was never the point.
          </p>
        </Prose>
      </DocBox>

      <DocBox label="what it is for">
        <CellGrid items={intentions} />
      </DocBox>
    </div>
  );
}

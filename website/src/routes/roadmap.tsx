import { createFileRoute } from "@tanstack/react-router";
import {
  BigHeading,
  BriefNote,
  DocBox,
  MetaRow,
  NumberedList,
  Prose,
  StripLabel,
} from "../components/prixy/document-parts";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "roadmap | where prixy goes next" },
      {
        name: "description",
        content:
          "the path from precise information retrieval to a trusted personal presence proxy.",
      },
      { property: "og:title", content: "roadmap | where prixy goes next" },
      {
        property: "og:description",
        content: "a focused path toward delegated digital presence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoadmapPage,
});

const stages = [
  {
    title: "now — supported sessions",
    description:
      "reliable attendance, focused listening, specific questions and concise answers across supported virtual events.",
  },
  {
    title: "next — registration and timing",
    description:
      "handle more of the work before a session, including registration, reminders, timezone handling and attendance requirements.",
  },
  {
    title: "later — personal context",
    description:
      "learn what matters to you while keeping instructions, source material and reporting under your control.",
  },
  {
    title: "eventually — broader presence",
    description:
      "extend the same delegation model to more digital spaces without turning prixy into a noisy productivity layer.",
  },
];

function RoadmapPage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "document", value: "roadmap" },
          { label: "type", value: "schedule" },
          { label: "issue", value: "006" },
          { label: "status", value: "preview" },
        ]}
      />

      <BriefNote>
        schedule sheet. ordered by confidence, not by date, because dates on a preview are fiction.
      </BriefNote>

      <StripLabel>roadmap</StripLabel>
      <BigHeading>
        one answer,
        <br />
        then trust.
      </BigHeading>

      <DocBox label="intent">
        <Prose>
          <p>
            the goal is not to process more meetings. it is to give back the time you would have
            spent attending them.
          </p>
        </Prose>
      </DocBox>

      <DocBox label="stages">
        <NumberedList items={stages} />
      </DocBox>
    </div>
  );
}

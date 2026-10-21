import { createFileRoute } from "@tanstack/react-router";
import { Bot, Wrench } from "lucide-react";
import {
  BigHeading,
  BriefNote,
  CellGrid,
  MetaRow,
  StripLabel,
} from "@/components/prixy/document-parts";

export const Route = createFileRoute("/suite")({
  head: () => ({
    meta: [
      { title: "suite — prixy" },
      {
        name: "description",
        content:
          "prixy is the first of a small family of agents. meet the siblings in development.",
      },
      { property: "og:title", content: "suite — prixy" },
      {
        property: "og:description",
        content:
          "prixy is the first of a small family of agents. meet the siblings in development.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuitePage,
});

function SuitePage() {
  return (
    <div>
      <MetaRow
        fields={[
          { label: "doc", value: "suite" },
          { label: "issue", value: "01" },
          { label: "status", value: "preview" },
        ]}
      />
      <BigHeading>prixy is only the first</BigHeading>

      <BriefNote label="brief">
        prixy handles delegated presence for meetings and live sessions. it is
        the first member of a small family of agents, each built for a different
        kind of task. the suite will grow slowly and only release agents that
        earn their place through daily use.
      </BriefNote>

      <StripLabel>family principles</StripLabel>
      <div className="border-x border-b border-primary px-4 py-4">
        <ul className="space-y-2 text-sm leading-relaxed text-foreground">
          <li className="flex gap-3">
            <span className="text-primary opacity-60">01</span>
            <span>every agent solves one concrete problem well.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-primary opacity-60">02</span>
            <span>agents share the same quiet, text-first reporting style.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-primary opacity-60">03</span>
            <span>each one runs under your identity, not on its own.</span>
          </li>
        </ul>
      </div>

      <StripLabel>siblings</StripLabel>
      <CellGrid
        columns={2}
        items={[
          {
            title: "milo",
            description:
              "a memory and context agent. milo keeps track of ongoing threads across conversations, documents, and decisions so nothing drops between sessions.",
            icon: <Bot size={18} />,
            marker: "in development",
          },
          {
            title: "jerry",
            description:
              "the jerryrigging agent. jerry patches together quick workflows, one-off scripts, and improvised connections between tools when there is no formal integration.",
            icon: <Wrench size={18} />,
            marker: "in development",
          },
        ]}
      />
    </div>
  );
}

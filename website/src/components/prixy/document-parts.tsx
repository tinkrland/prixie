import type { ReactNode } from "react";

/*
  every page in this site is presented as a printed specification document.
  these are the only building blocks pages should use, so the ruled grid stays
  identical from route to route instead of drifting per page.
*/

type MetaField = {
  label: string;
  value: string;
};

export function MetaRow({ fields }: { fields: MetaField[] }) {
  return (
    <div className="flex flex-wrap border border-primary">
      {fields.map((field, fieldIndex) => (
        <div
          key={field.label}
          className={`min-w-28 flex-1 px-3 py-2 ${
            fieldIndex < fields.length - 1 ? "border-r border-primary" : ""
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.18em] text-primary opacity-60">
            {field.label}
          </div>
          <div className="mt-0.5 text-sm text-foreground">{field.value}</div>
        </div>
      ))}
    </div>
  );
}

export function BriefNote({ label = "brief", children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex border-x border-b border-primary">
      <div className="flex items-start border-r border-primary px-3 py-3">
        <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-primary opacity-60">
          {label}
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs leading-relaxed text-foreground opacity-80">{children}</p>
      </div>
    </div>
  );
}

export function StripLabel({ children }: { children: ReactNode }) {
  return (
    <div className="border-x border-b border-primary px-4 py-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-primary opacity-60">
        {children}
      </span>
    </div>
  );
}

export function BigHeading({ children }: { children: ReactNode }) {
  return (
    <div className="border-x border-b border-primary px-4 pt-8 pb-4">
      <h1
        className="font-display font-black uppercase leading-[0.88] tracking-tight text-primary"
        style={{ fontSize: "clamp(3rem, 11vw, 8rem)" }}
      >
        {children}
      </h1>
    </div>
  );
}

export function DocBox({
  label,
  children,
  filled = false,
}: {
  label: string;
  children: ReactNode;
  filled?: boolean;
}) {
  return (
    <div className={`border-x border-b border-primary ${filled ? "bg-primary" : ""}`}>
      <div
        className={`border-b px-3 py-1.5 ${
          filled ? "border-primary-foreground/30" : "border-primary"
        }`}
      >
        <span
          className={`text-xs uppercase tracking-[0.18em] ${
            filled ? "text-primary-foreground opacity-80" : "text-primary opacity-75"
          }`}
        >
          {label}
        </span>
      </div>
      <div className={`px-4 py-4 ${filled ? "text-primary-foreground" : ""}`}>{children}</div>
    </div>
  );
}

type CellItem = {
  title: string;
  description: string;
  marker?: string;
  icon?: ReactNode;
};

/*
  a responsive ruled grid of cells. the border logic is verbose on purpose:
  the printed look depends on cells sharing single rules rather than doubling up.
*/
export function CellGrid({ items, columns = 3 }: { items: CellItem[]; columns?: 2 | 3 }) {
  const columnClass = columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className={`grid grid-cols-1 border border-primary ${columnClass}`}>
      {items.map((item) => (
        <div key={item.title} className="border-b border-primary p-4 last:border-b-0 sm:border-r">
          {item.marker && (
            <div className="mb-1.5 text-[9px] uppercase tracking-[0.2em] text-primary opacity-55">
              {item.marker}
            </div>
          )}
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
            {item.icon && <span className="text-primary opacity-80">{item.icon}</span>}
            {item.title}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function NumberedList({ items }: { items: { title: string; description: string }[] }) {
  return (
    <ol className="border border-primary">
      {items.map((item, itemIndex) => (
        <li
          key={item.title}
          className={`flex gap-4 px-4 py-3 ${
            itemIndex < items.length - 1 ? "border-b border-primary" : ""
          }`}
        >
          <span className="pt-0.5 text-[10px] tracking-[0.18em] text-primary opacity-60">
            {String(itemIndex + 1).padStart(2, "0")}
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">{item.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="border border-primary px-2 py-0.5 text-xs text-primary">{children}</span>;
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-black [&_h2]:uppercase [&_h2]:tracking-tight [&_h2]:text-primary">
      {children}
    </div>
  );
}

export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <p
      className="border-y border-primary py-4 font-display font-black uppercase leading-[0.95] tracking-tight text-primary"
      style={{ fontSize: "clamp(1.5rem, 4vw, 2.6rem)" }}
    >
      {children}
    </p>
  );
}

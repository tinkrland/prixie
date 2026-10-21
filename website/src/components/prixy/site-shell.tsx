import { Link, Outlet, useRouterState } from "@tanstack/react-router";

/*
  the shell is a document wrapper: a sticky metadata header, a link row, and a
  footer plate. the "doc" cell in the header echoes the current route so the page
  always reads like a numbered sheet inside one manual.
*/
const primaryLinks = [
  { to: "/", label: "index" },
  { to: "/purpose", label: "purpose" },
  { to: "/problem", label: "problem" },
  { to: "/philosophy", label: "philosophy" },
  { to: "/about", label: "about" },
  { to: "/features", label: "features" },
  { to: "/features/capabilities", label: "capabilities" },
  { to: "/features/supports", label: "supports" },
  { to: "/suite", label: "suite" },
  { to: "/roadmap", label: "roadmap" },
] as const;

export function SiteShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentDocument =
    primaryLinks.find((link) => link.to === pathname)?.label ?? pathname.replace("/", "");

  return (
    <div className="flex min-h-full flex-col">
      <div className="pointer-events-none fixed top-0 left-0 z-20 hidden h-full w-8 items-center justify-center lg:flex">
        <span
          className="font-mono text-[9px] whitespace-nowrap text-primary uppercase tracking-[0.25em] opacity-40"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          prixy — personal presence proxy — go, listen, ask, return
        </span>
      </div>

      <header className="sticky top-0 z-30 bg-background">
        <div className="flex border border-primary">
          <div className="flex items-center border-r border-primary px-4 py-2">
            <Link
              to="/"
              className="font-display text-xl leading-none font-black tracking-tight text-primary uppercase"
            >
              prixy
            </Link>
          </div>
          <div className="hidden flex-1 flex-col justify-center border-r border-primary px-3 py-1.5 sm:flex">
            <div className="text-[9px] uppercase tracking-[0.18em] text-primary opacity-55">type</div>
            <div className="text-xs text-foreground">personal presence proxy</div>
          </div>
          <div className="hidden flex-col justify-center border-r border-primary px-3 py-1.5 md:flex">
            <div className="text-[9px] uppercase tracking-[0.18em] text-primary opacity-55">status</div>
            <div className="text-xs text-foreground">preview</div>
          </div>
          <div className="hidden flex-col justify-center px-3 py-1.5 md:flex">
            <div className="text-[9px] uppercase tracking-[0.18em] text-primary opacity-55">doc</div>
            <div className="text-xs text-foreground">{currentDocument || "index"}</div>
          </div>
        </div>

        <div className="overflow-x-auto border-x border-b border-primary px-3 py-2">
          <nav className="flex items-center gap-4 whitespace-nowrap" aria-label="primary navigation">
            {primaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeOptions={{ exact: true }}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{
                  className: "text-xs text-primary font-semibold underline underline-offset-2",
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 lg:pl-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      <footer className="mt-12 lg:pl-8">
        <div className="mx-auto max-w-5xl">
          <div className="border border-t-2 border-primary">
            <div className="border-b border-primary px-4 py-1.5">
              <span className="text-[10px] uppercase tracking-[0.18em] text-primary opacity-60">
                concept and documentation
              </span>
            </div>
            <div className="flex flex-col sm:flex-row">
              <div className="flex-1 border-b border-primary px-4 py-5 sm:border-b-0 sm:border-r">
                <div className="font-display text-2xl font-black tracking-tight text-foreground uppercase">
                  prixy
                </div>
                <div className="mt-1 text-xs text-muted-foreground">personal presence proxy</div>
                <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  this is an explanatory shell, not the live product. prixy is currently in
                  development.
                </p>
              </div>
              <div className="flex items-center justify-center px-6 py-5">
                <div
                  className="flex items-center justify-center border border-primary"
                  style={{ width: 80, height: 80, transform: "rotate(45deg)" }}
                >
                  <div style={{ transform: "rotate(-45deg)" }} className="text-center">
                    <div className="text-[8px] leading-tight font-bold uppercase tracking-[0.08em] text-primary">
                      go
                      <br />
                      and
                      <br />
                      return
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

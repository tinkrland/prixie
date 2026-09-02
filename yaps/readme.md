# yaps

docs for memorium. lowercase, personal, not a product pitch.

these docs explain what memorium is, why it exists, how it works, and where it's going. they are written for humans, not for investors. if you want the technical deep-dive, go to `technobabble/`.

## what's in here

| file | what |
| --- | --- |
| `about.md` | what memorium is, in plain language |
| `features.md` | what memorium does |
| `problem.md` | the problem memorium solves |
| `concept-sketch.md` | the core ideas, sketched out |
| `roadmap.md` | where memorium is going |
| `technobabble/` | technical docs (stack, architecture, internals) |

## technobabble

| file | what |
| --- | --- |
| `technobabble/behindthescenes.md` | how memorium works in practice |
| `technobabble/underthehood.md` | the internals — retrieval pipeline, decay, indexing |
| `technobabble/technobabble.md` | the stack and why each piece was chosen |
| `technobabble/archtecture.md` | system architecture with diagrams |

## the short version

memorium is a standalone, portable, persona-based memory system. it is not an LLM memory layer. it is a structured context engine. it knows what information is important, what it relates to, who it belongs to, and when it should matter.

it is extremely agnostic to your stack. it is GUI first. it is designed to be human-legible, sandboxed by default, and underconfident by design.

it exists within prixie but is designed to work independently. this branch is where standalone memorium lives as a concept, outside of prixie.

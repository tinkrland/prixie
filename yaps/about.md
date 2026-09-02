# about

memorium is a standalone, portable, persona-based memory system. it exists within prixie but is designed to work independently. it is not an LLM memory layer. it is a structured context engine.

the core idea: memory becomes a weighted, hierarchical, associative structure that knows what information is important, what it relates to, who it belongs to, and when it should matter.

## the reframe: POV switching

memorium is not "a persona joining a meeting." it is switching perspective.

think of it like a shared laptop. your coworker sits down, switches to their account, opens their instagram. the laptop is the same. the apps are the same. but what they see, what they can access, what matters to them — all different. they're a different perspective.

memorium does the same thing, but instead of different people, it's different perspectives of you: student you, founder you, employee you, hobbyist you. the POV switch is rapid. one minute you're in a standup as employee you. the next you're joining a hackathon as hobbyist you. the system doesn't deploy "a new agent." it shifts perspective.

## what it is not

- it is not a vector database. it uses vectors, but they are one component of a much richer retrieval system.
- it is not a chatbot memory. it does not store conversation history. it stores structured knowledge.
- it is not a note-taking tool. it does not summarize. it indexes, weights, and retrieves.
- it is not coupled to prixie. prixie uses it, but memorium is designed to work standalone with any system.

## what makes it different

1. **two independent axes of memory.** weight (how core something is to identity) and hierarchy (how much it drives behavior). these are not the same thing. "i am a developer" is high weight (it's who i am) and high hierarchy (it drives what i do). "the exam is tomorrow" is low weight (not part of my identity) but high hierarchy (it's all i'm thinking about).

2. **AO3-style tag wrangling.** instead of requiring rigid taxonomies or embeddings expertise, information is organized using tags the way humans naturally describe things. synonyms, misspellings, abbreviations — all wrangled to canonical concepts. inspired by archive of our own's open-source tag system.

3. **human-legible retrieval.** when retrieval gets something wrong, you can inspect why. every retrieval is logged with component scores. no black box.

4. **sandboxed by default.** personas are isolated. sharing is opt-in, per-memory, conditional. no leaks unless you explicitly configure them.

5. **underconfident by design.** the system defaults to uncertainty. it asks to repeat, says it's unsure, rather than overconfidently replying. no context drift.

6. **GUI first.** the visual interface is the primary way to interact with memorium. personas are visual entities. memory is visualized as weighted, hierarchical structures. permissions are a matrix. sharing is a flow diagram. the GUI is not a wrapper — it is the interface.

7. **stack-agnostic.** memorium does not assume your database, backend, frontend, or language. it defines a data model and a retrieval pipeline. you implement it in whatever you already use.

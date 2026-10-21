// mem0 memory service. conversational memory for the voice loop: what was asked,
// what was answered, so prixie never repeats herself mid-call.
// mem0 is open source: github.com/mem0ai/mem0

// add a moment to memory (question asked, answer heard, side comment)
export async function remember(conversationId: string, moment: string): Promise<void> {
  throw new Error("not implemented: mem0 wiring lands with the voice loop");
}

// recall what already happened in this conversation
export async function recall(conversationId: string, query: string): Promise<string[]> {
  throw new Error("not implemented: mem0 wiring lands with the voice loop");
}

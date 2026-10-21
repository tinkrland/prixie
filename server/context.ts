// retelldb context service. what prixie knows before she speaks: persona, topic,
// prepared questions. stubbed until the retelldb source zip lands in this branch.

export interface SpeechContext {
  persona: {
    name: string;
    tone: "serious" | "casual" | "playful";
    formality: number; // 0..1
    vocabulary: number; // 0..1
  };
  meetingTopic: string;
  preparedQuestions: string[];
  answersAlreadyHave: string[];
}

// TODO: retelldb integration. the zip defines the context model. until then
// callers get a stub so the voice loop can be built against a fixed shape.
export async function loadContext(meetingId: string): Promise<SpeechContext> {
  return {
    persona: { name: "prixie", tone: "casual", formality: 0.5, vocabulary: 0.5 },
    meetingTopic: "",
    preparedQuestions: [],
    answersAlreadyHave: [],
  };
}

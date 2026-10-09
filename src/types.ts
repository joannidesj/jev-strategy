export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Situation = { [key: string]: JsonValue };
export type OptionId =
  | "fold"
  | "check"
  | "call"
  | "bet_small"
  | "bet_medium"
  | "bet_big"
  | "raise_small"
  | "raise_medium"
  | "raise_big"
  | "all_in";
export type Option = { id: OptionId; description: string; sizes?: Size[] };
export type Size = "small" | "medium" | "big" | "all_in";
export type Style = {
  id: string;
  name: string;
  tagline: string;
  sizes: Size[];
  sampling: "top" | "weighted";
  floor: number;
  temperature: number;
  minConfidence: number;
  engine: "v1" | "v2";
  readTrust: number;
  bluffBoost: number;
  instinctWeight: number;
  bluffFloor: number;
  realize: number;
  instructions: string;
};
export type GameGuide = { id: string; rules: string; strategy: string };
export type ReadsGuide = {
  notes: string;
  strength: { question: string; levels: string[] };
  bluffing: { question: string; yes: string; no: string };
  folds: { question: string; yes: string; no: string };
  board: { question: string; levels: string[] };
};
export type ReadInstructions = string | { [key: string]: JsonValue };
export type ReadQuestion =
  | { type: "score"; instructions: ReadInstructions; criteria: string[] }
  | { type: "noul"; instructions: ReadInstructions; criteria: { true: string; false: string } }
  | { type: "choice"; instructions: ReadInstructions; criteria: Record<string, string> };
export type ReadsRequest = { state: Situation; questions: Record<string, ReadQuestion> };
export type Decision = {
  optionId: OptionId;
  probabilities: Partial<Record<OptionId, number>>;
  confidence: number;
  inputTokens: number;
  model?: string;
};
export type JevQuestion = {
  state: { rules: string; situation: Situation };
  instructions: string;
  criteria: Record<string, string>;
};
export type JevAnswer = {
  probabilities: Record<string, number>;
  confidence: number;
  inputTokens: number;
  model?: string;
};
export type ReadAnswer =
  | { type: "score"; probabilities: number[]; confidence: number }
  | { type: "noul"; noul: number }
  | { type: "choice"; probabilities: Record<string, number>; confidence: number };
export type ReadsAnswer = {
  answers: Record<string, ReadAnswer>;
  inputTokens: number;
  model?: string;
};
export interface DecisionClient {
  ask(question: JevQuestion, signal: AbortSignal): Promise<JevAnswer>;
  read(request: ReadsRequest, signal: AbortSignal): Promise<ReadsAnswer>;
}
export type DecisionErrorKind = "unavailable" | "transient" | "bad-answer";

export class DecisionError extends Error {
  constructor(
    readonly kind: DecisionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "DecisionError";
  }
}

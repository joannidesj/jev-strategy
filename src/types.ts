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
export type Option = { id: OptionId; description: string };
export type Size = "small" | "medium" | "big" | "all_in";
export type Style = {
  id: string;
  name: string;
  tagline: string;
  sizes: Size[];
  sampling: "top" | "weighted";
  instructions: string;
};
export type GameGuide = { id: string; rules: string; strategy: string };
export type Decision = {
  optionId: OptionId;
  probabilities: Partial<Record<OptionId, number>>;
  confidence: number;
  inputTokens: number;
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
};
export interface DecisionClient {
  ask(question: JevQuestion, signal: AbortSignal): Promise<JevAnswer>;
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

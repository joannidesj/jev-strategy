import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  TypeSafeClient,
  choice,
  noul,
  score,
  type Fetch,
  type Question,
} from "@typesafe-ai/sdk";
import {
  DecisionError,
  type DecisionClient,
  type JevAnswer,
  type JevQuestion,
  type ReadAnswer,
  type ReadQuestion,
  type ReadsAnswer,
  type ReadsRequest,
} from "./types.js";

function toQuestion(question: ReadQuestion): Question {
  if (question.type === "score") {
    const [lowest, next, ...rest] = question.criteria;
    if (lowest === undefined || next === undefined) throw new Error("A score needs two levels");
    return score(question.instructions, [lowest, next, ...rest]);
  }
  if (question.type === "noul") return noul(question.instructions, question.criteria);
  return choice(question.instructions, question.criteria);
}

type RawAnswer =
  | { type: "score"; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number }
  | { type: "choice"; probabilities: Record<string, number>; confidence: number };

function toAnswer(raw: RawAnswer): ReadAnswer {
  if (raw.type === "noul") return { type: "noul", noul: raw.noul };
  if (raw.type === "choice") {
    return { type: "choice", probabilities: { ...raw.probabilities }, confidence: raw.confidence };
  }
  const levels = Object.keys(raw.probabilities)
    .map(Number)
    .sort((a, b) => a - b);
  return {
    type: "score",
    probabilities: levels.map((level) => raw.probabilities[level] ?? 0),
    confidence: raw.confidence,
  };
}

export const jevModel = "jev-latest";

function aborted(): Error {
  const error = new Error("The decision was aborted");
  error.name = "AbortError";
  return error;
}

function toFailure(error: unknown): Error {
  if (error instanceof APIUserAbortError) return aborted();
  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError ||
    (error instanceof APIError && error.status === 402)
  ) {
    return new DecisionError("unavailable", "Jev rejected the request");
  }
  if (error instanceof APIError || error instanceof APIConnectionError) {
    return new DecisionError("transient", "Jev could not be reached");
  }
  return error instanceof Error ? error : new Error("Unknown Jev failure");
}

export function createTypeSafeClient(config: { apiKey: string; fetch?: Fetch }): DecisionClient {
  const client = new TypeSafeClient({
    apiKey: config.apiKey,
    logLevel: "off",
    timeout: 1500,
    retry: { maxRetries: 1, backoffInitialMs: 200 },
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });
  return {
    async ask(question: JevQuestion, signal: AbortSignal): Promise<JevAnswer> {
      try {
        const { answers, usage, model } = await client.systemOne(
          {
            model: jevModel,
            state: question.state,
            questions: { action: choice(question.instructions, question.criteria) },
          },
          { signal },
        );
        return {
          probabilities: answers.action.probabilities,
          confidence: answers.action.confidence,
          inputTokens: usage.input_tokens,
          model,
        };
      } catch (error) {
        throw toFailure(error);
      }
    },
    async read(request: ReadsRequest, signal: AbortSignal): Promise<ReadsAnswer> {
      try {
        const questions = Object.fromEntries(
          Object.entries(request.questions).map(([id, question]) => [id, toQuestion(question)]),
        );
        const { answers, usage, model } = await client.systemOne(
          { model: jevModel, state: request.state, questions },
          { signal },
        );
        return {
          answers: Object.fromEntries(
            Object.entries(answers).map(([id, raw]) => [id, toAnswer(raw as RawAnswer)]),
          ),
          inputTokens: usage.input_tokens,
          model,
        };
      } catch (error) {
        throw toFailure(error);
      }
    },
  };
}

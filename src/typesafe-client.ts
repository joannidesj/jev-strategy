import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  TypeSafeClient,
  choice,
  type Fetch,
} from "@typesafe-ai/sdk";
import { DecisionError, type DecisionClient, type JevAnswer, type JevQuestion } from "./types.js";

const MODEL = "jev-latest";

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
        const { answers, usage } = await client.systemOne(
          {
            model: MODEL,
            state: question.state,
            questions: { action: choice(question.instructions, question.criteria) },
          },
          { signal },
        );
        return {
          probabilities: answers.action.probabilities,
          confidence: answers.action.confidence,
          inputTokens: usage.input_tokens,
        };
      } catch (error) {
        throw toFailure(error);
      }
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTypeSafeClient } from "../src/typesafe-client.js";
import { DecisionError, type JevQuestion } from "../src/types.js";

const apiKey = "sk-secret-key-12345";
const question: JevQuestion = {
  state: { rules: "the rules", situation: { pot: 10 } },
  instructions: "pick one",
  criteria: { fold: "give up", call: "match" },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const success = {
  model: "jev-latest",
  answers: {
    action: {
      type: "choice",
      choice: "call",
      confidence: 0.8,
      probabilities: { fold: 0.2, call: 0.8 },
    },
  },
  usage: { input_tokens: 123, output_tokens: 4 },
};

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

describe("createTypeSafeClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps a choice answer and token usage", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const client = createTypeSafeClient({
      apiKey,
      fetch: async (input, init) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return json(success);
      },
    });
    const answer = await client.ask(question, new AbortController().signal);
    expect(answer).toEqual({
      probabilities: { fold: 0.2, call: 0.8 },
      confidence: 0.8,
      inputTokens: 123,
      model: "jev-latest",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.body).toMatchObject({
      model: "jev-latest",
      state: question.state,
      questions: { action: { instructions: "pick one", criteria: question.criteria } },
    });
  });

  it("reads send score, noul and choice questions and map their answers", async () => {
    const requests: unknown[] = [];
    const client = createTypeSafeClient({
      apiKey,
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return json({
          model: "jev-1.13.0",
          answers: {
            strength_2: {
              type: "score",
              score: 1.2,
              confidence: 0.4,
              legend: { 0: "a", 1: "b", 2: "c" },
              probabilities: { 2: 0.3, 0: 0.1, 1: 0.6 },
            },
            folds_2: { type: "noul", noul: 0.25 },
            instinct: {
              type: "choice",
              choice: "call",
              confidence: 0.5,
              probabilities: { fold: 0.25, call: 0.75 },
            },
          },
          usage: { input_tokens: 900, output_tokens: 10 },
        });
      },
    });
    const reads = await client.read(
      {
        state: { notes: "n", situation: { pot: 3 } },
        questions: {
          strength_2: {
            type: "score",
            instructions: { question: "how strong" },
            criteria: ["a", "b", "c"],
          },
          folds_2: { type: "noul", instructions: "fold?", criteria: { true: "yes", false: "no" } },
          instinct: { type: "choice", instructions: "which", criteria: { fold: "f", call: "c" } },
        },
      },
      new AbortController().signal,
    );
    expect(reads).toEqual({
      answers: {
        strength_2: { type: "score", probabilities: [0.1, 0.6, 0.3], confidence: 0.4 },
        folds_2: { type: "noul", noul: 0.25 },
        instinct: { type: "choice", probabilities: { fold: 0.25, call: 0.75 }, confidence: 0.5 },
      },
      inputTokens: 900,
      model: "jev-1.13.0",
    });
    expect(requests[0]).toMatchObject({
      model: "jev-latest",
      state: { notes: "n", situation: { pot: 3 } },
      questions: {
        strength_2: { type: "score", criteria: ["a", "b", "c"] },
        folds_2: { type: "noul" },
        instinct: { type: "choice", criteria: { fold: "f", call: "c" } },
      },
    });
  });

  it("401 is unavailable", async () => {
    const client = createTypeSafeClient({ apiKey, fetch: async () => json({ error: "no" }, 401) });
    const error = await failureOf(client.ask(question, new AbortController().signal));
    expect(error).toBeInstanceOf(DecisionError);
    expect((error as DecisionError).kind).toBe("unavailable");
  });

  it("402 is unavailable", async () => {
    const client = createTypeSafeClient({ apiKey, fetch: async () => json({ error: "pay" }, 402) });
    const error = await failureOf(client.ask(question, new AbortController().signal));
    expect((error as DecisionError).kind).toBe("unavailable");
  });

  it("429 after retry is transient", async () => {
    let calls = 0;
    const client = createTypeSafeClient({
      apiKey,
      fetch: async () => {
        calls += 1;
        return json({ error: "slow down" }, 429, { "retry-after-ms": "1" });
      },
    });
    const error = await failureOf(client.ask(question, new AbortController().signal));
    expect((error as DecisionError).kind).toBe("transient");
    expect(calls).toBe(2);
  });

  it("network failure is transient", async () => {
    const client = createTypeSafeClient({
      apiKey,
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const error = await failureOf(client.ask(question, new AbortController().signal));
    expect((error as DecisionError).kind).toBe("transient");
  });

  it("a hanging attempt is abandoned after 1500 ms and one retry fits inside 4 s", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const client = createTypeSafeClient({
      apiKey,
      fetch: (_input, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    });
    const result = failureOf(client.ask(question, new AbortController().signal));
    await vi.advanceTimersByTimeAsync(1499);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1 + 200);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1500);
    const error = await result;
    expect((error as DecisionError).kind).toBe("transient");
    expect(calls).toBe(2);
  });

  it("abort becomes AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = createTypeSafeClient({ apiKey, fetch: async () => json(success) });
    const error = await failureOf(client.ask(question, controller.signal));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("AbortError");
  });

  it("error messages never contain the api key", async () => {
    const statuses = [401, 402, 403, 429, 500];
    for (const status of statuses) {
      const client = createTypeSafeClient({
        apiKey,
        fetch: async () => json({ error: `bad ${apiKey}` }, status, { "retry-after-ms": "1" }),
      });
      const error = (await failureOf(client.ask(question, new AbortController().signal))) as Error;
      expect(error.message).not.toContain(apiKey);
      expect(String(error.stack)).not.toContain(apiKey);
    }
  });
});

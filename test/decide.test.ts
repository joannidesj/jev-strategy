import { describe, expect, it } from "vitest";
import { decide } from "../src/decide.js";
import {
  DecisionError,
  type DecisionClient,
  type GameGuide,
  type JevAnswer,
  type JevQuestion,
  type Option,
  type Style,
} from "../src/types.js";

const game: GameGuide = { id: "g", rules: "the rules", strategy: "the strategy" };
const style: Style = {
  id: "s",
  name: "S",
  tagline: "t",
  sizes: ["small", "medium", "big", "all_in"],
  sampling: "top",
  floor: 0,
  temperature: 1,
  minConfidence: 0,
  engine: "v1",
  readTrust: 0.6,
  bluffBoost: 1,
  instinctWeight: 0.1,
  bluffFloor: 0.6,
  realize: 1,
  instructions: "be bold",
};
const options: Option[] = [
  { id: "fold", description: "give up" },
  { id: "call", description: "match" },
  { id: "raise_small", description: "small raise" },
  { id: "raise_big", description: "big raise" },
  { id: "all_in", description: "everything" },
];
const situation = { pot: 10 };

function fake(probabilities: Record<string, number>) {
  const asked: JevQuestion[] = [];
  const client: DecisionClient = {
    read: () => Promise.reject(new Error("reads are not used here")),
    async ask(question): Promise<JevAnswer> {
      asked.push(question);
      return { probabilities, confidence: 0.7, inputTokens: 123 };
    },
  };
  return { client, asked };
}

function run(
  client: DecisionClient,
  extra: { style?: Style; options?: Option[]; random?: () => number; signal?: AbortSignal } = {},
) {
  return decide({
    game,
    style: extra.style ?? style,
    situation,
    options: extra.options ?? options,
    client,
    random: extra.random ?? (() => 0),
    signal: extra.signal ?? new AbortController().signal,
  });
}

describe("decide", () => {
  it("sends rules and situation as state and options as criteria", async () => {
    const { client, asked } = fake({ call: 1 });
    await run(client);
    expect(asked).toEqual([
      {
        state: { rules: "the rules", situation },
        instructions: "the strategy\n\nYour style: be bold",
        criteria: Object.fromEntries(options.map((o) => [o.id, o.description])),
      },
    ]);
  });

  it("top sampling picks the most likely offered option", async () => {
    const { client } = fake({ fold: 0.2, call: 0.5, raise_big: 0.3 });
    const decision = await run(client);
    expect(decision.optionId).toBe("call");
    expect(decision.confidence).toBe(0.7);
    expect(decision.inputTokens).toBe(123);
  });

  it("passes on the model that answered", async () => {
    const client: DecisionClient = {
      read: () => Promise.reject(new Error("reads are not used here")),
      ask: async () => ({
        probabilities: { call: 1 },
        confidence: 1,
        inputTokens: 5,
        model: "jev-1.13.0",
      }),
    };
    expect((await run(client)).model).toBe("jev-1.13.0");
  });

  it("top sampling gives ties to the earlier option", async () => {
    const { client } = fake({ call: 0.5, fold: 0.5 });
    expect((await run(client)).optionId).toBe("fold");
  });

  it("a floor drops unlikely options before a weighted draw", async () => {
    const pair = options.slice(0, 2);
    const answer = { fold: 0.05, call: 0.95 };
    const draw = { options: pair, random: () => 0.01 };
    const plain: Style = { ...style, sampling: "weighted" };
    expect((await run(fake(answer).client, { ...draw, style: plain })).optionId).toBe("fold");
    const floored: Style = { ...plain, floor: 0.1 };
    expect((await run(fake(answer).client, { ...draw, style: floored })).optionId).toBe("call");
  });

  it("a floor above every option keeps them all", async () => {
    const floored: Style = { ...style, sampling: "weighted", floor: 0.9 };
    const decision = await run(fake({ fold: 0.5, call: 0.5 }).client, {
      style: floored,
      options: options.slice(0, 2),
      random: () => 0.1,
    });
    expect(decision.optionId).toBe("fold");
  });

  it("a temperature below one sharpens the draw toward the likeliest option", async () => {
    const pair = options.slice(0, 2);
    const answer = { fold: 0.3, call: 0.7 };
    const draw = { options: pair, random: () => 0.2 };
    const plain: Style = { ...style, sampling: "weighted" };
    expect((await run(fake(answer).client, { ...draw, style: plain })).optionId).toBe("fold");
    const sharp: Style = { ...plain, temperature: 0.5 };
    const decision = await run(fake(answer).client, { ...draw, style: sharp });
    expect(decision.optionId).toBe("call");
    expect(decision.probabilities).toEqual({ fold: 0.3, call: 0.7 });
  });

  it("weighted sampling follows the random draw", async () => {
    const weighted: Style = { ...style, sampling: "weighted" };
    const pair = options.slice(0, 2);
    const answer = { fold: 0.2, call: 0.8 };
    const low = await run(fake(answer).client, {
      style: weighted,
      options: pair,
      random: () => 0.1,
    });
    const high = await run(fake(answer).client, {
      style: weighted,
      options: pair,
      random: () => 0.5,
    });
    expect(low.optionId).toBe("fold");
    expect(high.optionId).toBe("call");
    expect(high.probabilities).toEqual({ fold: 0.2, call: 0.8 });
  });

  it("weighted sampling renormalises and survives a draw of nearly one", async () => {
    const weighted: Style = { ...style, sampling: "weighted" };
    const { client } = fake({ fold: 0.1, call: 0.1, bet_big: 0.8 });
    const decision = await run(client, {
      style: weighted,
      options: options.slice(0, 2),
      random: () => 0.9999999,
    });
    expect(decision.optionId).toBe("call");
    expect(decision.probabilities).toEqual({ fold: 0.5, call: 0.5 });
  });

  it("style sizes filter bet and raise options", async () => {
    const { client, asked } = fake({ call: 1 });
    await run(client, { style: { ...style, sizes: ["big"] } });
    expect(Object.keys(asked[0]!.criteria)).toEqual(["fold", "call", "raise_big"]);
  });

  it("a merged option survives when any of its sizes is allowed", async () => {
    const { client, asked } = fake({ bet_small: 1 });
    const merged: Option[] = [
      { id: "check", description: "check" },
      { id: "bet_small", description: "bet 2", sizes: ["small", "medium", "big"] },
      { id: "bet_medium", description: "bet 4", sizes: ["medium"] },
      { id: "all_in", description: "everything" },
    ];
    const decision = await run(client, {
      style: { ...style, sizes: ["big", "all_in"] },
      options: merged,
    });
    expect(Object.keys(asked[0]!.criteria)).toEqual(["check", "bet_small", "all_in"]);
    expect(decision.optionId).toBe("bet_small");
  });

  it("style sizes without any bet or raise keep the plain options", async () => {
    const { client, asked } = fake({ call: 1 });
    await run(client, { style: { ...style, sizes: [] } });
    expect(Object.keys(asked[0]!.criteria)).toEqual(["fold", "call"]);
  });

  it("ignores probability on options that were not offered", async () => {
    const { client } = fake({ raise_medium: 0.9, fold: 0.1 });
    const decision = await run(client);
    expect(decision.optionId).toBe("fold");
    expect(decision.probabilities).toEqual({
      fold: 1,
      call: 0,
      raise_small: 0,
      raise_big: 0,
      all_in: 0,
    });
  });

  it("an answer with no offered option throws bad-answer", async () => {
    const { client } = fake({ raise_medium: 1, call: Number.NaN, fold: -1 });
    const error = await run(client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecisionError);
    expect((error as DecisionError).kind).toBe("bad-answer");
  });

  it("abort propagates", async () => {
    const controller = new AbortController();
    const abort = new DOMException("aborted", "AbortError");
    const client: DecisionClient = {
      read: () => Promise.reject(new Error("reads are not used here")),
      ask: () => Promise.reject(abort),
    };
    controller.abort();
    await expect(run(client, { signal: controller.signal })).rejects.toBe(abort);
  });
});

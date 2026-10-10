import { describe, expect, it } from "vitest";
import {
  decideWithReads,
  type DecisionClient,
  type GameAdapter,
  type Option,
  type ReadAnswer,
  type ReadsGuide,
  type ReadsRequest,
  type StrengthReads,
  type Style,
} from "../src/index.js";

type View = { pot: number; toCall: number; win: number };

const guide: ReadsGuide = {
  notes: "n",
  strength: { question: "s", levels: ["a", "b", "c", "d", "e"] },
  bluffing: { question: "b", yes: "y", no: "n" },
  folds: { question: "f", yes: "y", no: "n" },
  board: { question: "b", levels: ["w", "x", "y", "z"] },
};

const style: Style = {
  id: "s",
  name: "S",
  tagline: "t",
  sizes: ["small", "medium", "big", "all_in"],
  sampling: "top",
  floor: 0,
  temperature: 1e-6,
  minConfidence: 0,
  engine: "v2",
  readTrust: 1,
  bluffBoost: 1,
  instinctWeight: 0,
  bluffFloor: 0.6,
  realize: 1,
  instructions: "",
};

const chips: Record<string, number> = { fold: 0, check: 0, call: 10, bet_big: 30, all_in: 100 };

function adapter(seen: StrengthReads[] = []): GameAdapter<View> {
  return {
    opponents: () => [3],
    priors: () => new Map([[3, [0.1, 0.1, 0.2, 0.4, 0.2]]]),
    pot: (view) => view.pot,
    toCall: (view) => view.toCall,
    cardsToCome: () => 0,
    costs: (_view, options) => options.map((o) => ({ id: o.id, chips: chips[o.id] ?? 0 })),
    odds: (view, reads) => {
      seen.push(reads);
      return { win: view.win, winCalled: view.win };
    },
  };
}

function client(answers: Record<string, ReadAnswer>): DecisionClient {
  return {
    ask: () => Promise.reject(new Error("not used")),
    read: async () => ({ answers, inputTokens: 12, model: "m" }),
  };
}

const option = (id: Option["id"]): Option => ({ id, description: id });

const run = (
  view: View,
  options: Option[],
  answers: Record<string, ReadAnswer>,
  seen: StrengthReads[] = [],
) =>
  decideWithReads({
    adapter: adapter(seen),
    view,
    situation: {},
    options,
    guide,
    style,
    client: client(answers),
    random: () => 0,
    signal: new AbortController().signal,
  });

describe("decideWithReads", () => {
  it("bets when the opponent is read to fold", async () => {
    const decision = await run(
      { pot: 30, toCall: 0, win: 0.1 },
      [option("check"), option("bet_big")],
      {
        folds_3: { type: "noul", noul: 0.95 },
      },
    );
    expect(decision.optionId).toBe("bet_big");
  });

  it("never folds when another option clearly wins chips", async () => {
    const decision = await run(
      { pot: 30, toCall: 10, win: 0.6 },
      [option("fold"), option("call")],
      {},
    );
    expect(decision.optionId).toBe("call");
    expect(decision.probabilities).not.toHaveProperty("fold");
  });

  it("drops an all-in bluff when no fold read is confident", async () => {
    const decision = await run(
      { pot: 30, toCall: 0, win: 0.2 },
      [option("check"), option("all_in")],
      { folds_3: { type: "noul", noul: 0.5 } },
    );
    expect(decision.evs).not.toHaveProperty("all_in");
  });

  it("passes each strength read with trust lowered by the bluffing read", async () => {
    const seen: StrengthReads[] = [];
    await run(
      { pot: 30, toCall: 0, win: 0.5 },
      [option("check")],
      {
        strength_3: { type: "score", probabilities: [0, 0, 0, 0, 1], confidence: 0.2 },
        bluffing_3: { type: "noul", noul: 0.25 },
      },
      seen,
    );
    expect(seen[0]!.get(3)).toEqual({ levels: [0, 0, 0, 0, 1], trust: 0.75 });
  });

  it("ignores a malformed strength read", async () => {
    const seen: StrengthReads[] = [];
    await run(
      { pot: 30, toCall: 0, win: 0.5 },
      [option("check")],
      {
        strength_3: { type: "score", probabilities: [5, 5], confidence: 1 },
      },
      seen,
    );
    expect(seen[0]!.size).toBe(0);
  });

  it("takes the number of strength levels from the game's reads guide", async () => {
    const seen: StrengthReads[] = [];
    await decideWithReads({
      adapter: adapter(seen),
      view: { pot: 30, toCall: 0, win: 0.5 },
      situation: {},
      options: [option("check")],
      guide: { ...guide, strength: { question: "s", levels: ["low", "mid", "high"] } },
      style,
      client: client({
        strength_3: { type: "score", probabilities: [0.2, 0.3, 0.5], confidence: 1 },
      }),
      random: () => 0,
      signal: new AbortController().signal,
    });
    expect(seen[0]!.get(3)).toEqual({ levels: [0.2, 0.3, 0.5], trust: 0.8 });
  });

  it("puts the chances from the visible cards into the strength question", async () => {
    let asked: ReadsRequest | undefined;
    const capture: DecisionClient = {
      ask: () => Promise.reject(new Error("not used")),
      read: async (request) => {
        asked = request;
        return { answers: {}, inputTokens: 1 };
      },
    };
    await decideWithReads({
      adapter: adapter(),
      view: { pot: 30, toCall: 0, win: 0.5 },
      situation: {},
      options: [option("check")],
      guide,
      style,
      client: capture,
      random: () => 0,
      signal: new AbortController().signal,
    });
    expect(asked!.questions.strength_3!.instructions).toMatchObject({
      fromVisibleCards: { a: "10%", b: "10%", c: "20%", d: "40%", e: "20%" },
    });
  });
});

describe("decideWithReads board read", () => {
  it("treats a board read whose chances do not add up as neutral", async () => {
    const neutral = await run(
      { pot: 30, toCall: 0, win: 0.6 },
      [option("check"), option("bet_big")],
      {
        folds_3: { type: "noul", noul: 0.5 },
      },
    );
    const broken = await run(
      { pot: 30, toCall: 0, win: 0.6 },
      [option("check"), option("bet_big")],
      {
        folds_3: { type: "noul", noul: 0.5 },
        board: { type: "score", probabilities: [0, 0, 0, 9], confidence: 1 },
      },
    );
    expect(broken.evs.bet_big).toBeCloseTo(neutral.evs.bet_big!, 9);
  });
});

describe("decideWithReads realised equity", () => {
  const withRealize = (realize: number, cardsToCome: number) =>
    decideWithReads({
      adapter: { ...adapter(), cardsToCome: () => cardsToCome },
      view: { pot: 30, toCall: 10, win: 0.5 },
      situation: {},
      options: [option("fold"), option("call")],
      guide,
      style: { ...style, realize },
      client: client({}),
      random: () => 0,
      signal: new AbortController().signal,
    });

  it("discounts a call on round 1 by the full factor, and not at all on the last round", async () => {
    expect((await withRealize(0.7, 3)).evs.call).toBeCloseTo(0.7 * 0.5 * 40 - 10);
    expect((await withRealize(0.7, 0)).evs.call).toBeCloseTo(0.5 * 40 - 10);
  });
});

describe("decideWithReads minimum defence", () => {
  const facing = (win: number, cardsToCome: number, random = 0.99) =>
    decideWithReads({
      adapter: { ...adapter(), cardsToCome: () => cardsToCome },
      view: { pot: 12, toCall: 10, win },
      situation: {},
      options: [option("fold"), option("call")],
      guide,
      style: { ...style, realize: 0.6 },
      client: client({}),
      random: () => random,
      signal: new AbortController().signal,
    });

  it("keeps calling an early bet at least as often as the pot before it is to the pot after it", async () => {
    const decision = await facing(0.5, 3);
    expect(decision.evs.call).toBeLessThan(0);
    expect(decision.probabilities.fold).toBeCloseTo(10 / 12, 6);
    expect(decision.probabilities.call).toBeCloseTo(2 / 12, 6);
    expect(decision.optionId).toBe("call");
    expect((await facing(0.5, 2)).probabilities.fold).toBeCloseTo(10 / 12, 6);
  });

  it("still folds a clearly losing hand, and leaves the late rounds alone", async () => {
    expect((await facing(0.1, 3)).probabilities.fold).toBeCloseTo(1, 6);
    expect((await facing(0.45, 1)).probabilities.fold).toBeCloseTo(1, 6);
  });
});

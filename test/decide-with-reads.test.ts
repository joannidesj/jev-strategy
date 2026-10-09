import { describe, expect, it } from "vitest";
import {
  decideWithReads,
  type DecisionClient,
  type GameAdapter,
  type Option,
  type ReadAnswer,
  type ReadsGuide,
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
  instructions: "",
};

const chips: Record<string, number> = { fold: 0, check: 0, call: 10, bet_big: 30, all_in: 100 };

function adapter(seen: StrengthReads[] = []): GameAdapter<View> {
  return {
    opponents: () => [3],
    pot: (view) => view.pot,
    toCall: (view) => view.toCall,
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
});

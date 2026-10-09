import { describe, expect, it } from "vitest";
import { buildReads, loadReads } from "../src/index.js";
import type { Option, ReadsGuide, Style } from "../src/types.js";

const guide: ReadsGuide = {
  notes: "Queens are wild.",
  strength: {
    question: "How strong will this hand be at showdown?",
    levels: ["a", "b", "c", "d", "e"],
  },
  bluffing: {
    question: "Is this player bluffing?",
    yes: "betting beyond the cards",
    no: "betting matches the cards",
  },
  folds: {
    question: "Would this player fold to a pot-sized bet?",
    yes: "would fold",
    no: "would call or raise",
  },
  board: { question: "How scary do my up cards look?", levels: ["w", "x", "y", "z"] },
};

const style: Style = {
  id: "s",
  name: "S",
  tagline: "t",
  sizes: ["small", "big"],
  sampling: "top",
  floor: 0,
  temperature: 1,
  minConfidence: 0,
  engine: "v2",
  readTrust: 0.6,
  bluffBoost: 1,
  instinctWeight: 0.1,
  bluffFloor: 0.6,
  instructions: "Play tight.",
};

const options: Option[] = [
  { id: "fold", description: "Fold and give up this hand" },
  { id: "call", description: "Call 4 chips (4% of my stack)" },
];

const situation = { game: "Follow the Queen", opponents: [{ seat: 2 }, { seat: 4 }] };

describe("buildReads", () => {
  it("asks three questions per opponent plus the board and the instinct", () => {
    const request = buildReads({ guide, situation, opponentSeats: [2, 4], options, style });
    expect(Object.keys(request.questions).sort()).toEqual(
      [
        "board",
        "bluffing_2",
        "bluffing_4",
        "folds_2",
        "folds_4",
        "instinct",
        "strength_2",
        "strength_4",
      ].sort(),
    );
  });

  it("points each opponent question at that opponent and keeps the five strength levels", () => {
    const request = buildReads({ guide, situation, opponentSeats: [2, 4], options, style });
    const strength = request.questions.strength_4!;
    expect(strength.type).toBe("score");
    expect(strength.criteria).toEqual(["a", "b", "c", "d", "e"]);
    expect(JSON.stringify(strength.instructions)).toContain("`opponents[1]`");
    expect(request.questions.folds_2).toMatchObject({
      type: "noul",
      criteria: { true: "would fold", false: "would call or raise" },
    });
  });

  it("gives each strength question the chances from the visible cards alone, in words", () => {
    const priors = new Map([[4, [0.1, 0.1, 0.2, 0.4, 0.2]]]);
    const request = buildReads({ guide, situation, opponentSeats: [2, 4], options, style, priors });
    expect(request.questions.strength_4!.instructions).toMatchObject({
      fromVisibleCards: { a: "10%", b: "10%", c: "20%", d: "40%", e: "20%" },
    });
    expect(request.questions.strength_2!.instructions).not.toHaveProperty("fromVisibleCards");
  });

  it("the instinct is a choice over the offered options with only the style text", () => {
    const request = buildReads({ guide, situation, opponentSeats: [2, 4], options, style });
    expect(request.questions.instinct).toEqual({
      type: "choice",
      instructions: { question: "Which action fits your style here?", style: "Play tight." },
      criteria: { fold: "Fold and give up this hand", call: "Call 4 chips (4% of my stack)" },
    });
  });

  it("sends short notes and the situation, never the full rules", () => {
    const request = buildReads({ guide, situation, opponentSeats: [2, 4], options, style });
    expect(request.state).toEqual({ notes: "Queens are wild.", situation });
  });

  it("with no opponents still asks about the board and the instinct", () => {
    const request = buildReads({
      guide,
      situation: { opponents: [] },
      opponentSeats: [],
      options,
      style,
    });
    expect(Object.keys(request.questions).sort()).toEqual(["board", "instinct"]);
  });
});

describe("loadReads", () => {
  it("loads the Follow the Queen reads with five strength and four board levels", async () => {
    const reads = await loadReads("follow-the-queen");
    expect(reads.strength.levels).toHaveLength(5);
    expect(reads.board.levels).toHaveLength(4);
    expect(reads.notes.length).toBeGreaterThan(40);
  });
});

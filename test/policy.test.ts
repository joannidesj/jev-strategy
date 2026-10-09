import { describe, expect, it } from "vitest";
import { foldEquity, mix, optionEvs } from "../src/index.js";
import type { Style } from "../src/types.js";

const style: Style = {
  id: "s",
  name: "S",
  tagline: "t",
  sizes: ["small", "medium", "big", "all_in"],
  sampling: "weighted",
  floor: 0,
  temperature: 0.1,
  minConfidence: 0,
  engine: "v2",
  readTrust: 0.6,
  bluffBoost: 1,
  instinctWeight: 0,
  bluffFloor: 0.6,
  instructions: "",
};

describe("foldEquity", () => {
  it("is the chance every opponent folds, scaled by how scary our board looks", () => {
    expect(foldEquity([0.5, 0.5], 1.5, 1)).toBeCloseTo(0.25);
    expect(foldEquity([0.5], 0, 1)).toBeCloseTo(0.5 * 0.875);
    expect(foldEquity([0.5], 3, 1)).toBeCloseTo(0.5 * 1.125);
  });

  it("a bluff boost multiplies it and it never passes 0.95", () => {
    expect(foldEquity([0.9], 3, 2)).toBe(0.95);
    expect(foldEquity([0.2], 1.5, 2)).toBeCloseTo(0.4);
  });

  it("is zero with no opponents to fold", () => {
    expect(foldEquity([], 3, 2)).toBe(0);
  });
});

describe("optionEvs", () => {
  const spot = { pot: 100, toCall: 20, eq: 0.5, eqCalled: 0.4 };

  it("folding is worth nothing, checking wins my share of the pot", () => {
    const evs = optionEvs(
      { ...spot, toCall: 0 },
      [
        { id: "check", chips: 0 },
        { id: "fold", chips: 0 },
      ],
      0,
    );
    expect(evs).toEqual({ check: 50, fold: 0 });
  });

  it("calling wins my share of the bigger pot less the price", () => {
    expect(optionEvs(spot, [{ id: "call", chips: 20 }], 0).call).toBeCloseTo(0.5 * 120 - 20);
  });

  it("a pot-sized bet or bigger gets the full fold equity", () => {
    const evs = optionEvs({ ...spot, toCall: 0 }, [{ id: "bet_big", chips: 100 }], 0.3);
    const called = 0.4 * (100 + 200) - 100;
    expect(evs.bet_big).toBeCloseTo(0.3 * 100 + 0.7 * called);
  });

  it("a smaller bet scares less: fold equity shrinks with the bet's share of the pot", () => {
    const evs = optionEvs({ ...spot, toCall: 0 }, [{ id: "bet_small", chips: 25 }], 0.4);
    const fe = 0.4 * 0.25;
    const called = 0.4 * (100 + 50) - 25;
    expect(evs.bet_small).toBeCloseTo(fe * 100 + (1 - fe) * called);
  });
});

describe("mix", () => {
  it("at a tiny temperature always takes the best option", () => {
    const cold = { ...style, temperature: 1e-6 };
    const result = mix({ fold: 0, call: 10, raise_big: 9 }, 100, {}, cold, () => 0.99);
    expect(result.optionId).toBe("call");
  });

  it("gives every option a share that sums to one", () => {
    const { probabilities } = mix({ fold: 0, call: 10, raise_big: 9 }, 100, {}, style, () => 0.5);
    const total = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1);
    expect(probabilities.call!).toBeGreaterThan(probabilities.fold!);
  });

  it("the instinct breaks a tie in expected value", () => {
    const keen = { ...style, instinctWeight: 1, temperature: 1e-6 };
    const result = mix(
      { check: 5, bet_small: 5 },
      100,
      { bet_small: 0.9, check: 0.1 },
      keen,
      () => 0.5,
    );
    expect(result.optionId).toBe("bet_small");
  });

  it("stays finite with huge expected values", () => {
    const { probabilities } = mix(
      { fold: 0, all_in: 1e9 },
      1,
      {},
      { ...style, temperature: 1e-6 },
      () => 0.5,
    );
    expect(probabilities.all_in).toBe(1);
  });
});

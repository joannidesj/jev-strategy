import { describe, expect, it } from "vitest";
import {
  DecisionError,
  evaluateFixtures,
  loadFixtures,
  loadGame,
  loadStyles,
  parseFixtures,
  requireApiKey,
  seededRandom,
  type DecisionClient,
  type FixtureFile,
} from "../src/index.js";

const options = [
  { id: "fold" as const, description: "Fold" },
  { id: "call" as const, description: "Call" },
];

const fixture = (choice: "fold" | "call") => ({
  situation: { pot: 10 },
  options,
  choice,
  probabilities: { fold: 0.5, call: 0.5 },
});

const callAlways: DecisionClient = {
  async ask() {
    return { probabilities: { call: 1 }, confidence: 1, inputTokens: 5 };
  },
};

describe("eval", () => {
  it("eval counts changed decisions", async () => {
    const fixtures: FixtureFile[] = [
      { file: "a.json", fixtures: [fixture("call"), fixture("fold")] },
      { file: "b.json", fixtures: [fixture("fold")] },
    ];
    const styles = await loadStyles("follow-the-queen");
    const outcome = await evaluateFixtures({
      fixtures,
      game: await loadGame("follow-the-queen"),
      style: styles.get("jev-try-hard")!,
      client: callAlways,
      random: seededRandom(1),
    });
    expect(outcome.changed).toBe(2);
    expect(outcome.results.map((r) => [r.file, r.recorded, r.chosen, r.changed])).toEqual([
      ["a.json", "call", "call", false],
      ["a.json", "fold", "call", true],
      ["b.json", "fold", "call", true],
    ]);
  });

  it("eval keeps going when one fixture fails", async () => {
    let calls = 0;
    const flaky: DecisionClient = {
      async ask(question, signal) {
        calls += 1;
        if (calls === 2) throw new DecisionError("transient", "Jev could not be reached");
        return callAlways.ask(question, signal);
      },
    };
    const seen: string[] = [];
    const outcome = await evaluateFixtures({
      fixtures: [{ file: "a.json", fixtures: [fixture("call"), fixture("fold"), fixture("fold")] }],
      game: await loadGame("follow-the-queen"),
      style: (await loadStyles("follow-the-queen")).get("jev-try-hard")!,
      client: flaky,
      random: seededRandom(1),
      onResult: (result) => seen.push(result.chosen ?? "error"),
    });
    expect(outcome.results.map((r) => [r.chosen, r.changed, r.error])).toEqual([
      ["call", false, undefined],
      [null, false, "transient"],
      ["call", true, undefined],
    ]);
    expect(outcome.changed).toBe(1);
    expect(outcome.errors).toBe(1);
    expect(seen).toEqual(["call", "error", "call"]);
  });

  it("eval refuses to run without TYPESAFE_API_KEY", () => {
    expect(() => requireApiKey({})).toThrow("Set TYPESAFE_API_KEY to run eval");
    expect(() => requireApiKey({ TYPESAFE_API_KEY: "" })).toThrow("Set TYPESAFE_API_KEY");
    expect(requireApiKey({ TYPESAFE_API_KEY: "k" })).toBe("k");
  });

  it("a seeded random repeats the same numbers", () => {
    const [a, b] = [seededRandom(7), seededRandom(7)];
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("the committed fixtures are all readable", async () => {
    const files = await loadFixtures("follow-the-queen");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file.fixtures.length).toBeGreaterThan(0);
  });

  it("a malformed fixture file is rejected with its name", () => {
    expect(() => parseFixtures("bad.json", "[{}]")).toThrow("bad.json");
    expect(() => parseFixtures("bad.json", "nope")).toThrow("bad.json");
  });
});

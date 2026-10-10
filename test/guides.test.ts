import { describe, expect, it } from "vitest";
import { loadGame, loadReads, loadStyles, parseReads, parseStyle } from "../src/index.js";

const catalogIds = [
  "jev-not-jeeves",
  "jev-pocalypse",
  "jev-try-hard",
  "jevermind",
  "jevious-george",
  "jev-a-lanche",
  "jevil-s-advocate",
  "jev-olution",
  "jevry-day",
  "jev-alier",
];

const validStyle = `---
id: sample
name: Sample
tagline: A sample
sizes: [small, big]
sampling: top
---
Play it straight.
`;

const withLines = (...lines: string[]) =>
  validStyle.replace("sampling: top", ["sampling: top", ...lines].join("\n"));

describe("game guides", () => {
  it("loads the follow-the-queen guide", async () => {
    const guide = await loadGame("follow-the-queen");
    expect(guide.id).toBe("follow-the-queen");
    expect(guide.rules.length).toBeGreaterThan(0);
    expect(guide.strategy.length).toBeGreaterThan(0);
    expect(guide.rules).toContain("Queens are wild");
  });

  it("loads ten styles whose ids match the server catalog ids", async () => {
    const styles = await loadStyles("follow-the-queen");
    expect([...styles.keys()].sort()).toEqual([...catalogIds].sort());
    for (const [id, style] of styles) expect(style.id).toBe(id);
  });

  it("jev-pocalypse checks when checking is free instead of folding", async () => {
    const { instructions } = (await loadStyles("follow-the-queen")).get("jev-pocalypse")!;
    expect(instructions).not.toContain("Raise or fold");
    expect(instructions).toContain("check when it's free");
  });

  it("rejects a style with an unknown size", () => {
    const bad = validStyle.replace("[small, big]", "[small, huge]");
    expect(() => parseStyle("sample.md", bad)).toThrow(/size/i);
  });

  it("rejects a style whose id differs from its file name", () => {
    expect(() => parseStyle("other.md", validStyle)).toThrow(/other/);
  });

  it("rejects a style with no frontmatter", () => {
    expect(() => parseStyle("sample.md", "Just text")).toThrow(/frontmatter/i);
  });

  it("style instructions are the Markdown body", () => {
    expect(parseStyle("sample.md", validStyle).instructions).toBe("Play it straight.");
  });

  it("gates default to off: no floor, temperature 1, no confidence minimum", () => {
    expect(parseStyle("sample.md", validStyle)).toMatchObject({
      floor: 0,
      temperature: 1,
      minConfidence: 0,
    });
  });

  it("reads floor, temperature and minConfidence from frontmatter", () => {
    const tuned = withLines("floor: 0.05", "temperature: 0.7", "minConfidence: 0.2");
    expect(parseStyle("sample.md", tuned)).toMatchObject({
      floor: 0.05,
      temperature: 0.7,
      minConfidence: 0.2,
    });
  });

  it("rejects a temperature of zero and a floor of one or more", () => {
    expect(() => parseStyle("sample.md", withLines("temperature: 0"))).toThrow(/temperature/);
    expect(() => parseStyle("sample.md", withLines("floor: 1"))).toThrow(/floor/);
  });
});

describe("Jev 2 style settings", () => {
  it("default to the v1 engine with middling read trust and no bluff boost", () => {
    expect(parseStyle("sample.md", validStyle)).toMatchObject({
      engine: "v1",
      readTrust: 0.6,
      bluffBoost: 1,
      instinctWeight: 0.1,
      bluffFloor: 0.6,
      realize: 1,
    });
  });

  it("rejects an unknown engine and a read trust above one", () => {
    expect(() => parseStyle("sample.md", withLines("engine: v3"))).toThrow(/engine/);
    expect(() => parseStyle("sample.md", withLines("readTrust: 1.5"))).toThrow(/readTrust/);
  });
});

describe("realised equity setting", () => {
  it("defaults to one and must stay between zero and one", () => {
    expect(parseStyle("sample.md", validStyle).realize).toBe(1);
    expect(parseStyle("sample.md", withLines("realize: 0.8")).realize).toBe(0.8);
    expect(() => parseStyle("sample.md", withLines("realize: 1.2"))).toThrow(/realize/);
  });
});

describe("Jev 2 temperature default", () => {
  it("a v2 style without a temperature gets the arena-tested 0.1, not 1", () => {
    expect(parseStyle("sample.md", withLines("engine: v2")).temperature).toBe(0.1);
    expect(parseStyle("sample.md", withLines("engine: v2", "temperature: 0.4")).temperature).toBe(
      0.4,
    );
    expect(parseStyle("sample.md", validStyle).temperature).toBe(1);
  });
});

describe("reads guides", () => {
  const reads = (strength: string[], board: string[]) =>
    [
      "notes: n",
      "strength:",
      "  question: s",
      "  levels:",
      ...strength.map((level) => `    - "${level}"`),
      "bluffing: { question: b, yes: y, no: n }",
      "folds: { question: f, yes: y, no: n }",
      "board:",
      "  question: b",
      "  levels:",
      ...board.map((level) => `    - "${level}"`),
    ].join("\n");

  it("a game's reads guide sets how many strength and board levels Jev answers with", () => {
    const guide = parseReads(reads(["low", "mid", "high"], ["calm", "scary"]));
    expect(guide.strength.levels).toEqual(["low", "mid", "high"]);
    expect(guide.board.levels).toEqual(["calm", "scary"]);
  });

  it("rejects a read with fewer than two levels", () => {
    expect(() => parseReads(reads(["only"], ["calm", "scary"]))).toThrow();
  });
});

describe("Texas Hold'em guides", () => {
  it("loads the Hold'em rules, strategy, reads and the five Hold'em Jevs, all on Jev 2", async () => {
    const guide = await loadGame("texas-holdem");
    expect(guide.id).toBe("texas-holdem");
    expect(guide.rules).toContain("Texas Hold'em");
    expect(guide.strategy).toContain("board");
    const reads = await loadReads("texas-holdem");
    expect(reads.strength.levels).toHaveLength(5);
    const styles = await loadStyles("texas-holdem");
    expect([...styles.keys()].sort()).toEqual([
      "jev-a-lanche",
      "jev-alier",
      "jev-not-jeeves",
      "jev-try-hard",
      "jevermind",
    ]);
    for (const style of styles.values()) {
      expect(style.engine, style.id).toBe("v2");
      expect(style.instructions, style.id).not.toMatch(/wild|Queen/i);
    }
  });
});

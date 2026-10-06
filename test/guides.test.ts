import { describe, expect, it } from "vitest";
import { loadGame, loadStyles, parseStyle } from "../src/index.js";

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
});

import { describe, expect, it } from "vitest";
import { jevVersion, loadReleases, parseReleases } from "../src/index.js";

const sample = `# Jev releases

Some intro text.

## 1.1.0 (2026-11-02)

- Plays tighter on the river.
- Fewer bluffs against short stacks.

Stray paragraph.

## 1.0.0 (2026-10-07)

- First public release.
`;

describe("releases", () => {
  it("parses version, date and notes for each release", () => {
    expect(parseReleases(sample)).toEqual([
      {
        version: "1.1.0",
        date: "2026-11-02",
        notes: ["Plays tighter on the river.", "Fewer bluffs against short stacks."],
      },
      { version: "1.0.0", date: "2026-10-07", notes: ["First public release."] },
    ]);
  });

  it("ignores text outside release sections", () => {
    const releases = parseReleases(
      "- stray bullet\n\n# Title\n\n## 1.0.0 (2026-10-07)\n\n- Note\n",
    );
    expect(releases).toEqual([{ version: "1.0.0", date: "2026-10-07", notes: ["Note"] }]);
  });

  it("a heading without a valid date is rejected with an error naming the line", () => {
    expect(() => parseReleases("# Jev releases\n\n## 1.0.0 (soon)\n\n- Note\n")).toThrow(
      /line 3.*## 1\.0\.0 \(soon\)/,
    );
  });

  it("the newest release matches the package version", () => {
    expect(loadReleases()[0]?.version).toBe(jevVersion);
  });
});

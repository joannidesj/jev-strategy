import { readFileSync } from "node:fs";
import { packageFolder } from "./version.js";

export type Release = { version: string; date: string; notes: string[] };

const headingPattern = /^## (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)\s*$/;

export function parseReleases(markdown: string): Release[] {
  const releases: Release[] = [];
  let current: Release | undefined;
  markdown.split(/\r?\n/).forEach((line, index) => {
    if (line.startsWith("## ")) {
      const match = headingPattern.exec(line);
      if (!match) {
        throw new Error(`Release heading on line ${index + 1} needs a version and date: ${line}`);
      }
      current = { version: match[1] ?? "", date: match[2] ?? "", notes: [] };
      releases.push(current);
    } else if (line.startsWith("- ") && current) {
      current.notes.push(line.slice(2).trim());
    }
  });
  return releases;
}

export function loadReleases(): Release[] {
  return parseReleases(readFileSync(new URL("RELEASES.md", packageFolder), "utf8"));
}

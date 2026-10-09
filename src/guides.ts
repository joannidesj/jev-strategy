import { readdir, readFile } from "node:fs/promises";
import { parse } from "yaml";
import { z } from "zod";
import type { GameGuide, ReadsGuide, Style } from "./types.js";

const frontmatterShape = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),
  sizes: z.array(z.enum(["small", "medium", "big", "all_in"])).min(1),
  sampling: z.enum(["top", "weighted"]),
  floor: z.number().min(0).lt(1).default(0),
  temperature: z.number().positive().optional(),
  minConfidence: z.number().min(0).max(1).default(0),
  engine: z.enum(["v1", "v2"]).default("v1"),
  readTrust: z.number().min(0).max(1).default(0.6),
  bluffBoost: z.number().positive().default(1),
  instinctWeight: z.number().min(0).default(0.1),
  bluffFloor: z.number().min(0).max(1).default(0.6),
  realize: z.number().min(0).max(1).default(1),
});

const readsShape = z.object({
  notes: z.string().min(1),
  strength: z.object({ question: z.string().min(1), levels: z.array(z.string().min(1)).length(5) }),
  bluffing: z.object({
    question: z.string().min(1),
    yes: z.string().min(1),
    no: z.string().min(1),
  }),
  folds: z.object({ question: z.string().min(1), yes: z.string().min(1), no: z.string().min(1) }),
  board: z.object({ question: z.string().min(1), levels: z.array(z.string().min(1)).length(4) }),
});

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseStyle(fileName: string, markdown: string): Style {
  const match = frontmatterPattern.exec(markdown);
  if (!match) throw new Error(`Style ${fileName} has no frontmatter`);
  let data: unknown;
  try {
    data = parse(match[1] ?? "");
  } catch (error) {
    throw new Error(`Style ${fileName} has unreadable frontmatter: ${String(error)}`);
  }
  const result = frontmatterShape.safeParse(data);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Style ${fileName} has invalid frontmatter (${problems})`);
  }
  const expectedId = fileName.replace(/\.md$/, "");
  if (result.data.id !== expectedId) {
    throw new Error(
      `Style ${fileName} has id "${result.data.id}" but the file is named ${expectedId}`,
    );
  }
  const temperature = result.data.temperature ?? (result.data.engine === "v2" ? 0.1 : 1);
  return { ...result.data, temperature, instructions: (match[2] ?? "").trim() };
}

function gameFolder(gameId: string): URL {
  return new URL(`../games/${gameId}/`, import.meta.url);
}

export async function loadGame(gameId: string): Promise<GameGuide> {
  const folder = gameFolder(gameId);
  const [rules, strategy] = await Promise.all([
    readFile(new URL("rules.md", folder), "utf8"),
    readFile(new URL("strategy.md", folder), "utf8"),
  ]);
  return { id: gameId, rules, strategy };
}

export async function loadStyles(gameId: string): Promise<Map<string, Style>> {
  const folder = new URL("styles/", gameFolder(gameId));
  const fileNames = (await readdir(folder)).filter((name) => name.endsWith(".md")).sort();
  const styles = new Map<string, Style>();
  for (const fileName of fileNames) {
    const style = parseStyle(fileName, await readFile(new URL(fileName, folder), "utf8"));
    styles.set(style.id, style);
  }
  return styles;
}

export async function loadReads(gameId: string): Promise<ReadsGuide> {
  const text = await readFile(new URL("reads.yaml", gameFolder(gameId)), "utf8");
  return readsShape.parse(parse(text));
}

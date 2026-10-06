import { readdir, readFile } from "node:fs/promises";
import { z } from "zod";
import { decide } from "./decide.js";
import type {
  DecisionClient,
  GameGuide,
  JsonValue,
  Option,
  OptionId,
  Situation,
  Style,
} from "./types.js";

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)]),
);

const optionId = z.enum([
  "fold",
  "check",
  "call",
  "bet_small",
  "bet_medium",
  "bet_big",
  "raise_small",
  "raise_medium",
  "raise_big",
  "all_in",
]);

const fixtureShape = z.object({
  situation: z.record(jsonValue),
  options: z.array(z.object({ id: optionId, description: z.string() })).min(1),
  choice: optionId,
  probabilities: z.record(optionId, z.number()).nullable(),
});

export type Fixture = {
  situation: Situation;
  options: Option[];
  choice: OptionId;
  probabilities: Partial<Record<OptionId, number>> | null;
};

export type FixtureFile = { file: string; fixtures: Fixture[] };

export type EvalResult = { file: string; recorded: OptionId; chosen: OptionId; changed: boolean };

export function parseFixtures(file: string, text: string): Fixture[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Fixture file ${file} is not valid JSON`);
  }
  const result = z.array(fixtureShape).safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(
      `Fixture file ${file} is invalid at ${first?.path.join(".")}: ${first?.message}`,
    );
  }
  return result.data;
}

export async function loadFixtures(gameId: string): Promise<FixtureFile[]> {
  const folder = new URL(`../games/${gameId}/fixtures/`, import.meta.url);
  const names = (await readdir(folder)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(
    names.map(async (name) => ({
      file: name,
      fixtures: parseFixtures(name, await readFile(new URL(name, folder), "utf8")),
    })),
  );
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function requireApiKey(env: Record<string, string | undefined>): string {
  const key = env.TYPESAFE_API_KEY;
  if (!key) throw new Error("Set TYPESAFE_API_KEY to run eval");
  return key;
}

type EvaluateInput = {
  fixtures: FixtureFile[];
  game: GameGuide;
  style: Style;
  client: DecisionClient;
  random: () => number;
};

export async function evaluateFixtures(
  input: EvaluateInput,
): Promise<{ results: EvalResult[]; changed: number }> {
  const results: EvalResult[] = [];
  for (const { file, fixtures } of input.fixtures) {
    for (const fixture of fixtures) {
      const decision = await decide({
        game: input.game,
        style: input.style,
        situation: fixture.situation,
        options: fixture.options,
        client: input.client,
        random: input.random,
        signal: new AbortController().signal,
      });
      results.push({
        file,
        recorded: fixture.choice,
        chosen: decision.optionId,
        changed: decision.optionId !== fixture.choice,
      });
    }
  }
  return { results, changed: results.filter((result) => result.changed).length };
}

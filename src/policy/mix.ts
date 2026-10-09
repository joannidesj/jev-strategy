import type { OptionId, Style } from "../types.js";

const INSTINCT_FLOOR = 0.01;

export function mix(
  evs: Partial<Record<OptionId, number>>,
  pot: number,
  instinct: Record<string, number>,
  style: Style,
  random: () => number,
): { optionId: OptionId; probabilities: Partial<Record<OptionId, number>> } {
  const ids = Object.keys(evs) as OptionId[];
  const scale = style.temperature * Math.max(pot, 1);
  const scores = ids.map(
    (id) =>
      evs[id]! / scale + style.instinctWeight * Math.log((instinct[id] ?? 0) + INSTINCT_FLOOR),
  );
  const top = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - top));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const probabilities = Object.fromEntries(ids.map((id, i) => [id, weights[i]! / total]));
  const draw = random();
  let running = 0;
  for (const id of ids) {
    running += probabilities[id]!;
    if (draw < running) return { optionId: id, probabilities };
  }
  return { optionId: ids[scores.indexOf(top)]!, probabilities };
}

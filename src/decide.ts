import {
  DecisionError,
  type Decision,
  type DecisionClient,
  type GameGuide,
  type Option,
  type OptionId,
  type Situation,
  type Size,
  type Style,
} from "./types.js";

type DecideInput = {
  game: GameGuide;
  style: Style;
  situation: Situation;
  options: Option[];
  client: DecisionClient;
  random: () => number;
  signal: AbortSignal;
};

function sizeOf(id: OptionId): Size | undefined {
  if (id === "all_in") return "all_in";
  const match = /^(?:bet|raise)_(small|medium|big)$/.exec(id);
  return match ? (match[1] as Size) : undefined;
}

function offeredOptions(options: Option[], style: Style): Option[] {
  return options.filter((option) => {
    const size = sizeOf(option.id);
    if (size === undefined) return true;
    return (option.sizes ?? [size]).some((s) => style.sizes.includes(s));
  });
}

function massOf(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function pickTop(ids: OptionId[], probabilities: Record<OptionId, number>): OptionId {
  let best = ids[0]!;
  for (const id of ids) if (probabilities[id] > probabilities[best]) best = id;
  return best;
}

function pickWeighted(
  ids: OptionId[],
  probabilities: Record<OptionId, number>,
  draw: number,
): OptionId {
  let total = 0;
  for (const id of ids) {
    total += probabilities[id];
    if (total > draw) return id;
  }
  return [...ids].reverse().find((id) => probabilities[id] > 0)!;
}

export async function decide(input: DecideInput): Promise<Decision> {
  const { game, style, situation, client, signal } = input;
  if (input.options.length === 0) throw new Error("decide needs at least one option");
  const options = offeredOptions(input.options, style);
  const answer = await client.ask(
    {
      state: { rules: game.rules, situation },
      instructions: `${game.strategy}\n\nYour style: ${style.instructions}`,
      criteria: Object.fromEntries(options.map((o) => [o.id, o.description])),
    },
    signal,
  );
  const ids = options.map((o) => o.id);
  const raw = Object.fromEntries(ids.map((id) => [id, massOf(answer.probabilities[id])])) as Record<
    OptionId,
    number
  >;
  const total = ids.reduce((sum, id) => sum + raw[id], 0);
  if (total <= 0) throw new DecisionError("bad-answer", "Jev gave no weight to any offered option");
  const probabilities = Object.fromEntries(ids.map((id) => [id, raw[id] / total])) as Record<
    OptionId,
    number
  >;
  const optionId =
    style.sampling === "top"
      ? pickTop(ids, probabilities)
      : pickWeighted(ids, probabilities, input.random());
  return {
    optionId,
    probabilities,
    confidence: answer.confidence,
    inputTokens: answer.inputTokens,
    model: answer.model,
  };
}

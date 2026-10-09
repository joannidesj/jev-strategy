import type { GameAdapter } from "./game-adapter.js";
import { foldEquity, mix, optionEvs } from "./policy/index.js";
import { buildReads } from "./reads.js";
import type {
  Decision,
  DecisionClient,
  Option,
  OptionId,
  ReadAnswer,
  ReadsGuide,
  Situation,
  Style,
} from "./types.js";

const NEUTRAL_FOLD = 0.3;
const NEUTRAL_BLUFF = 0.2;
const NEUTRAL_BOARD = 1.5;
const STRENGTH_LEVELS = 5;
const BLUFF_EQUITY = 0.5;
const CLEAR_WIN = 0.05;

export type ReadsDecision = Decision & {
  reads: Record<string, ReadAnswer>;
  evs: Partial<Record<OptionId, number>>;
};

export type ReadsInput<View> = {
  adapter: GameAdapter<View>;
  view: View;
  situation: Situation;
  options: Option[];
  guide: ReadsGuide;
  style: Style;
  client: DecisionClient;
  random: () => number;
  signal: AbortSignal;
};

function probability(answer: ReadAnswer | undefined, fallback: number): number {
  if (answer?.type !== "noul" || !(answer.noul >= 0 && answer.noul <= 1)) return fallback;
  return answer.noul;
}

function levelsOf(answer: ReadAnswer | undefined): number[] | null {
  if (answer?.type !== "score" || answer.probabilities.length !== STRENGTH_LEVELS) return null;
  const total = answer.probabilities.reduce((sum, p) => sum + p, 0);
  if (!(Math.abs(total - 1) < 0.01) || answer.probabilities.some((p) => !(p >= 0))) return null;
  return answer.probabilities;
}

function expectedLevel(answer: ReadAnswer | undefined): number {
  if (answer?.type !== "score" || answer.probabilities.length === 0) return NEUTRAL_BOARD;
  return answer.probabilities.reduce((sum, p, level) => sum + p * level, 0);
}

// Jev reads the table; the game adapter and the policy do every sum.
export async function decideWithReads<View>(input: ReadsInput<View>): Promise<ReadsDecision> {
  const { adapter, view, options, style } = input;
  const opponentSeats = adapter.opponents(view);
  const pot = adapter.pot(view);
  const toCall = adapter.toCall(view);

  const request = buildReads({
    guide: input.guide,
    situation: input.situation,
    opponentSeats,
    options,
    style,
  });
  const answer = await input.client.read(request, input.signal);
  const reads = answer.answers;

  const strength = new Map<number, { levels: number[]; trust: number }>();
  for (const seat of opponentSeats) {
    const levels = levelsOf(reads[`strength_${seat}`]);
    if (!levels) continue;
    const bluff = probability(reads[`bluffing_${seat}`], NEUTRAL_BLUFF);
    strength.set(seat, { levels, trust: style.readTrust * (1 - bluff) });
  }
  const odds = adapter.odds(view, strength);
  const folds = opponentSeats.map((seat) => probability(reads[`folds_${seat}`], NEUTRAL_FOLD));
  const fe = foldEquity(folds, expectedLevel(reads.board), style.bluffBoost);

  const costs = adapter.costs(view, options);
  const shaky = folds.every((fold) => Math.abs(2 * fold - 1) < style.bluffFloor);
  const allowed =
    odds.win < BLUFF_EQUITY && shaky
      ? costs.filter((cost) => cost.id !== "all_in" && !(cost.chips >= pot && cost.id !== "call"))
      : costs;
  const evs = optionEvs(
    { pot, toCall, eq: odds.win, eqCalled: odds.winCalled },
    allowed.length > 0 ? allowed : costs,
    fe,
  );
  const best = Math.max(...Object.entries(evs).map(([id, ev]) => (id === "fold" ? 0 : ev!)));
  if (best > CLEAR_WIN * pot) delete evs.fold;

  const instinct = reads.instinct?.type === "choice" ? reads.instinct : null;
  const { optionId, probabilities } = mix(
    evs,
    pot,
    instinct?.probabilities ?? {},
    style,
    input.random,
  );
  return {
    optionId,
    probabilities,
    confidence: instinct?.confidence ?? 1,
    inputTokens: answer.inputTokens,
    model: answer.model,
    reads,
    evs,
  };
}

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
const BOARD_LEVELS = 4;
const BLUFF_EQUITY = 0.5;
const CLEAR_WIN = 0.05;
const CLEAR_LOSS = 0.1;
const EARLY_CARDS_TO_COME = 2;

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

function levelsOf(answer: ReadAnswer | undefined, count: number): number[] | null {
  if (answer?.type !== "score" || answer.probabilities.length !== count) return null;
  const total = answer.probabilities.reduce((sum, p) => sum + p, 0);
  if (!(Math.abs(total - 1) < 0.01) || answer.probabilities.some((p) => !(p >= 0))) return null;
  return answer.probabilities;
}

function expectedLevel(answer: ReadAnswer | undefined): number {
  const levels = levelsOf(answer, BOARD_LEVELS);
  return levels ? levels.reduce((sum, p, level) => sum + p * level, 0) : NEUTRAL_BOARD;
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
    priors: adapter.priors(view),
  });
  const answer = await input.client.read(request, input.signal);
  const reads = answer.answers;

  const strength = new Map<number, { levels: number[]; trust: number }>();
  for (const seat of opponentSeats) {
    const levels = levelsOf(reads[`strength_${seat}`], STRENGTH_LEVELS);
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
    {
      pot,
      toCall,
      eq: odds.win,
      eqCalled: odds.winCalled,
      realize: style.realize ** (adapter.cardsToCome(view) / 3),
    },
    allowed.length > 0 ? allowed : costs,
    fe,
  );
  const best = Math.max(...Object.entries(evs).map(([id, ev]) => (id === "fold" ? 0 : ev!)));
  if (best > CLEAR_WIN * pot) delete evs.fold;

  // Folding to every early bet lets any bettor win the antes; defend unless the call clearly loses.
  const rawCall = odds.win * (pot + toCall) - toCall;
  const early = toCall > 0 && adapter.cardsToCome(view) >= EARLY_CARDS_TO_COME;
  const defend = early && "call" in evs && rawCall >= -CLEAR_LOSS * pot;
  const instinct = reads.instinct?.type === "choice" ? reads.instinct : null;
  const { optionId, probabilities } = mix(
    evs,
    pot,
    instinct?.probabilities ?? {},
    style,
    input.random,
    defend ? toCall / pot : 1,
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

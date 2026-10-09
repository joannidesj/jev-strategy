import type { Option, ReadQuestion, ReadsGuide, ReadsRequest, Situation, Style } from "./types.js";

type ReadsInput = {
  guide: ReadsGuide;
  situation: Situation;
  opponentSeats: number[];
  options: Option[];
  style: Style;
  priors?: ReadonlyMap<number, number[]>;
};

function inWords(levels: string[], chances: number[]): Record<string, string> {
  return Object.fromEntries(
    levels.map((level, i) => [level, `${Math.round((chances[i] ?? 0) * 100)}%`]),
  );
}

export function buildReads(input: ReadsInput): ReadsRequest {
  const { guide, situation, opponentSeats, options, style, priors } = input;
  const questions: Record<string, ReadQuestion> = {};
  opponentSeats.forEach((seat, index) => {
    const about = `\`opponents[${index}]\``;
    const prior = priors?.get(seat);
    questions[`strength_${seat}`] = {
      type: "score",
      instructions: {
        question: guide.strength.question,
        about,
        ...(prior ? { fromVisibleCards: inWords(guide.strength.levels, prior) } : {}),
      },
      criteria: guide.strength.levels,
    };
    questions[`bluffing_${seat}`] = {
      type: "noul",
      instructions: { question: guide.bluffing.question, about },
      criteria: { true: guide.bluffing.yes, false: guide.bluffing.no },
    };
    questions[`folds_${seat}`] = {
      type: "noul",
      instructions: { question: guide.folds.question, about },
      criteria: { true: guide.folds.yes, false: guide.folds.no },
    };
  });
  questions.board = {
    type: "score",
    instructions: { question: guide.board.question, about: "`myHand.upCards`" },
    criteria: guide.board.levels,
  };
  questions.instinct = {
    type: "choice",
    instructions: { question: "Which action fits your style here?", style: style.instructions },
    criteria: Object.fromEntries(options.map((o) => [o.id, o.description])),
  };
  return { state: { notes: guide.notes, situation }, questions };
}

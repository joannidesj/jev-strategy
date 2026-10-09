const MAX_FOLD_EQUITY = 0.95;

// `board` is the 0-3 scariness score of our face-up cards.
export function foldEquity(folds: number[], board: number, bluffBoost: number): number {
  if (folds.length === 0) return 0;
  const everyoneFolds = folds.reduce((product, fold) => product * fold, 1);
  const scare = 0.875 + board / 12;
  return Math.min(MAX_FOLD_EQUITY, Math.max(0, bluffBoost * everyoneFolds * scare));
}

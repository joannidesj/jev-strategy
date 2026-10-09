import type { OptionId } from "../types.js";

export type OptionCost = { id: OptionId; chips: number };
export type SpotOdds = { pot: number; toCall: number; eq: number; eqCalled: number };

function evOf(spot: SpotOdds, option: OptionCost, fe: number): number {
  const { pot, toCall, eq, eqCalled } = spot;
  if (option.id === "fold") return 0;
  if (option.id === "check") return eq * pot;
  if (option.id === "call") return eq * (pot + option.chips) - option.chips;
  const chips = option.chips;
  const calledAdds = Math.max(0, chips - toCall);
  const whenCalled = eqCalled * (pot + chips + calledAdds) - chips;
  const scare = fe * Math.min(1, calledAdds / Math.max(pot, 1));
  return scare * pot + (1 - scare) * whenCalled;
}

export function optionEvs(
  spot: SpotOdds,
  options: OptionCost[],
  fe: number,
): Partial<Record<OptionId, number>> {
  return Object.fromEntries(options.map((option) => [option.id, evOf(spot, option, fe)]));
}

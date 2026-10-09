import type { OptionCost } from "./policy/ev.js";
import type { Option } from "./types.js";

export type StrengthReads = ReadonlyMap<number, { levels: number[]; trust: number }>;

// What a game supplies so Jev's reads can drive its maths. Seats are numbers;
// everything else is plain chips and chances.
export interface GameAdapter<View> {
  opponents(view: View): number[];
  pot(view: View): number;
  toCall(view: View): number;
  costs(view: View, options: Option[]): OptionCost[];
  odds(view: View, reads: StrengthReads): { win: number; winCalled: number };
}

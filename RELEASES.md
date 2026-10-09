# Jev releases

The maintainer reviews playbook changes and publishes them together as a release. Jev doesn't learn on the fly.

## 2.0.0 (2026-10-09)

- Jev-try-hard moves to the new Jev 2 engine. Jev reads each opponent: how strong their hand will be at showdown, whether they are bluffing, and whether they would fold. Code then works out the value of every option and picks the best.
- Jev is told each opponent's chances from the cards anyone can see, and code remembers what each player showed after betting before.
- Early calls are valued with the betting still to come, so Jev-try-hard calls less on the first rounds.
- In the arena, Jev-try-hard on Jev 2 beat the 1.1 version of itself heads-up and came out ahead of the pot-odds bot. The other nine styles keep the 1.1 engine for now.

## 1.1.0 (2026-10-09)

- Jev now sees the whole hand: every bet, call and fold so far, and how each opponent has played over their last 50 hands at the table.
- Hands with fewer than five cards are described honestly, so two pair and four of a kind show up before the river.
- Each option says what share of the stack it costs, and Jev is told how many wild cards it holds and how many it cannot see.
- Weighted styles ignore options Jev gives under 5%. Jev-try-hard and Jevry Day pass a turn to a simple pot-odds player when Jev is unsure.
- When Jev cannot be reached, the pot-odds player takes the turn instead of checking or folding.

## 1.0.0 (2026-10-07)

- First public release: ten Follow the Queen styles sharing one playbook.

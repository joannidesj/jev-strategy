# @ftq/jev-strategy

Turns a poker situation into a decision made by Jev, TypeSafe's judgment model.
It describes the game in plain words, asks Jev how likely each legal option is,
and picks one option according to a playing style.

It knows nothing about the FTQ engine or server. Callers pass in a situation and
the legal options, and get one option back.

## What it exports

- `decide({ game, style, situation, options, client, random, signal })`: asks a
  `DecisionClient` and returns the chosen option, the normalised probabilities,
  Jev's confidence and the input tokens used.
- `loadGame(id)` and `loadStyles(id)`: read the rules, the strategy and the
  styles from `games/<id>/`.
- `createTypeSafeClient({ apiKey })`: the real `DecisionClient`, using the
  `jev-latest` model.
- `DecisionError`: `unavailable`, `transient` or `bad-answer`.

## Add a style

1. Add `games/<game>/styles/<id>.md`. The file name (without `.md`) must equal
   the `id` field.
2. Write YAML frontmatter with these fields:
   - `id`, `name`, `tagline`: strings.
   - `sizes`: a list of `small`, `medium`, `big` and `all_in`. Sizes you leave
     out are never offered to Jev.
   - `sampling`: `top` takes the most likely option; `weighted` draws one in
     proportion to its probability.
3. Write the body as short advice to a player.
4. Run the tests, then run eval to see how the style plays.

## Jev 2: reads and maths

A style with `engine: v2` does not ask Jev which action to take. It asks for
narrow reads, then lets code do the sums:

- **Reads:** for each opponent, how strong their hand will be at showdown (a
  Score over five levels), whether they are bluffing, and whether they would fold
  to a pot-sized bet (Nouls). It also reads how scary our own board looks. The
  wording lives in `games/<game>/reads.yaml`.
- **Maths:** win chance weighted by the strength reads, fold equity from the fold
  reads (smaller bets scare less), an expected value per option, then a soft-max
  pick at the style's `temperature`.

`decideWithReads` runs this for any game that supplies a `GameAdapter`. The
adapter's six functions give the opponents' seats, each opponent's chances from
the visible cards, the pot, the price to call, the chips each option puts in, and
the win chances given the reads. Follow the
Queen's adapter lives in the server, next to its rules engine.

## Add a game

Every game lives in its own folder, so adding one never touches another game.

1. Add `games/<id>/`: `rules.md`, `strategy.md`, `reads.yaml`, `styles/*.md` and
   `fixtures/`. The strength and board levels in `reads.yaml` set how many levels
   Jev answers with; nothing in `src/` fixes those counts.
2. In the site, add the game's engine rules (`packages/engine/src/games/<id>/`),
   its view, events and summary (`packages/protocol/src/games/<id>.ts`), its
   server kit with a `GameAdapter` for its seat view
   (`packages/server/src/games/<id>/`), and its web module
   (`packages/web/src/games/<id>/`). Each package registers the game in one line.
3. Run the arena against the fixed bots before releasing, and give the game its
   own section in `RELEASES.md`.

## Run eval

Eval replays the recorded decisions in `games/<game>/fixtures/*.json` through a
style. It prints one line per fixture with the recorded choice and the new
choice, marks the ones that changed, and ends with the number changed and the
number of fixtures where Jev failed (a failure does not stop the run).

```sh
pnpm -F @ftq/jev-strategy eval [styleId] [gameId]
```

Eval reads `TYPESAFE_API_KEY` from `packages/server/.env` when it exists, or
from the environment. The style defaults to `jev-try-hard`. The random draws are seeded, so runs are
comparable. Without `TYPESAFE_API_KEY` it stops with a message. Fixtures come
from the server's `jev:fixtures` script.

For more checks against a running server, see
[docs/ops/jev-checks.md](../../docs/ops/jev-checks.md).

## Releasing a new Jev

Jev changes only when the maintainer deploys a release.

1. Merge the accepted playbook pull requests.
2. Run eval.
3. Bump `version` in `package.json`.
4. Add an entry to `RELEASES.md`.
5. Deploy.

## License

MIT. See `LICENSE`.

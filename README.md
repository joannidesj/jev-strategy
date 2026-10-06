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

## Run eval

Eval replays the recorded decisions in `games/<game>/fixtures/*.json` through a
style. It prints one line per fixture with the recorded choice and the new
choice, marks the ones that changed, and ends with the number changed and the
number of fixtures where Jev failed (a failure does not stop the run).

```sh
TYPESAFE_API_KEY=... pnpm -F @ftq/jev-strategy eval [styleId]
```

The style defaults to `jev-try-hard`. The random draws are seeded, so runs are
comparable. Without `TYPESAFE_API_KEY` it stops with a message. Fixtures come
from the server's `jev:fixtures` script.

## License

MIT. See `LICENSE`.

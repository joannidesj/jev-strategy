# @ftq/jev-strategy

Turns a poker situation into a decision made by Jev, TypeSafe's judgment model.
The package describes the game in plain words, asks Jev how likely each legal
option is, and picks one option according to a playing style.

It knows nothing about the FTQ engine or server. Callers pass in the situation
and the legal options, and get back one option.

## Pieces

- `GameGuide`: the rules and general strategy for a game.
- `Style`: a personality (name, tagline, bet sizes it may use, how it samples
  from Jev's answer, and its own instructions).
- `decide`: asks a `DecisionClient` and picks an offered option.
- `DecisionError`: `unavailable`, `transient` or `bad-answer`.

## Add a style

1. Add a YAML file to the styles folder with `id`, `name`, `tagline`, `sizes`,
   `sampling` (`top` or `weighted`) and `instructions`.
2. Keep `instructions` short and written as advice to a player.
3. Run the tests, then run `eval` to see how the new style plays.

## Run eval

Set `TYPESAFE_API_KEY`, then run the package's `eval` script from the repo
root. It plays sample situations against Jev and prints the chosen options.

## Licence

MIT. See `LICENSE`.

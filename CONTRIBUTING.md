# Contributing

Thank you for helping Jev play better.

## Licence

jev-strategy is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may read, run, change and
share it for any noncommercial purpose, as long as you pass on the licence and
the `Required Notice:` line. Commercial use needs a separate licence from the
maintainer: open an issue titled "Commercial licence" to ask.

## Contributor agreement

Every pull request needs agreement to the [Contributor License Agreement](CLA.md).
It lets the maintainer ship your change in the free version and in commercially
licensed versions. You keep the copyright in your work.

## What to change

- **Playbook and styles:** `games/<game>/strategy.md` and
  `games/<game>/styles/*.md` are plain English. Most improvements start here.
- **Decision core:** `src/` turns a situation into one of the legal options.

## Check your change

Replay the recorded decisions through your style with your own TypeSafe key:

```sh
pnpm -F @ftq/jev-strategy eval [styleId] [gameId]
```

Say in the pull request which fixtures changed choice and why that is better.

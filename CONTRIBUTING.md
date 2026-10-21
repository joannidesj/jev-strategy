# Contributing

Thank you for helping Jev play better.

## Licence

jev-strategy is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may read, run, change and
share it for any noncommercial purpose, as long as you pass on the licence and
the `Required Notice:` line. Commercial use needs a separate licence from the
maintainer: email tables@judgementtables.com or open an issue titled "Commercial licence".

## Contributor agreement

Every pull request needs agreement to the [Contributor License Agreement](CLA.md).
It lets the maintainer ship your change in the free version and in commercially
licensed versions. You keep the copyright in your work.

## What to change

- **Playbook and styles:** `games/<game>/strategy.md` and
  `games/<game>/styles/*.md` are plain English. Most improvements start here.
- **Decision core:** `src/` turns a situation into one of the legal options.

## Check your change

The package runs on its own with Node 22 and pnpm:

```sh
pnpm install
pnpm test
```

Then replay the recorded decisions through your style with your own TypeSafe key. Put
`TYPESAFE_API_KEY=...` in a `.env` file next to `package.json` (git ignores it):

```sh
pnpm eval [styleId] [gameId]
```

Say in the pull request which fixtures changed choice and why that is better.

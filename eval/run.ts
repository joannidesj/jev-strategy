import {
  createTypeSafeClient,
  evaluateFixtures,
  loadFixtures,
  loadGame,
  loadStyles,
  requireApiKey,
  seededRandom,
} from "../src/index.js";

const GAME = "follow-the-queen";
const SEED = 1;

try {
  const apiKey = requireApiKey(process.env);
  const styleId = process.argv[2] ?? "jev-try-hard";
  const styles = await loadStyles(GAME);
  const style = styles.get(styleId);
  if (!style) throw new Error(`Unknown style ${styleId}. Known: ${[...styles.keys()].join(", ")}`);
  const fixtures = await loadFixtures(GAME);
  const { results, changed } = await evaluateFixtures({
    fixtures,
    game: await loadGame(GAME),
    style,
    client: createTypeSafeClient({ apiKey }),
    random: seededRandom(SEED),
  });
  for (const r of results) {
    console.log(
      `${r.file}: recorded ${r.recorded}, now ${r.chosen}${r.changed ? "  (changed)" : ""}`,
    );
  }
  console.log(`Changed decisions: ${changed} of ${results.length} (style ${style.id})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

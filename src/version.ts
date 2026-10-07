import { readFileSync } from "node:fs";
import { z } from "zod";

const packageShape = z.object({ version: z.string().min(1) });

export const packageFolder = new URL("../", import.meta.url);

export const jevVersion = packageShape.parse(
  JSON.parse(readFileSync(new URL("package.json", packageFolder), "utf8")),
).version;

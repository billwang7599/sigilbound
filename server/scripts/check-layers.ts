/**
 * Fails when core imports an outlet, or an outlet imports another outlet (plan/architecture.md).
 * Outlets: api/, ws/, db/. Only main.ts may wire them together.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const OUTLETS = ["api", "ws", "db"];
const layerOf = (file: string) => relative(SRC, file).split("/")[0]!;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const problems: string[] = [];
for (const file of files(SRC)) {
  const from = layerOf(file);
  if (from.endsWith(".ts")) continue; // main.ts wires everything
  for (const m of readFileSync(file, "utf8").matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const to = layerOf(resolve(dirname(file), m[1]!));
    if (to === from) continue;
    if (from === "core" && OUTLETS.includes(to)) problems.push(`${relative(SRC, file)}: core must not import ${to}/`);
    if (OUTLETS.includes(from) && OUTLETS.includes(to)) problems.push(`${relative(SRC, file)}: ${from}/ must not import ${to}/`);
    if (to === "main.ts") problems.push(`${relative(SRC, file)}: nothing imports main.ts`);
  }
}
if (problems.length) {
  console.error("Layer check failed:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("layers ok");

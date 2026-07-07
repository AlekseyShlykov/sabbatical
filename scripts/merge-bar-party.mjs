#!/usr/bin/env node
/** Merge Day 4.5 bar party passages into scripts/twine-export-ru.json */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = join(dir, "twine-export-ru.json");
const patchPath = join(dir, "bar-party-patch.json");

const story = JSON.parse(readFileSync(src, "utf8"));
const patch = JSON.parse(readFileSync(patchPath, "utf8"));

const byName = Object.fromEntries(story.passages.map((p) => [p.name, p]));
for (const p of patch) {
  byName[p.name] = p;
}

const order = story.passages.map((p) => p.name);
for (const p of patch) {
  if (!order.includes(p.name)) order.push(p.name);
}

story.passages = order.map((name) => byName[name]).filter(Boolean);
writeFileSync(src, JSON.stringify(story, null, 2) + "\n");
console.log(`Merged ${patch.length} passages into twine-export-ru.json`);

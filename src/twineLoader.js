// twineLoader.js
// Parse a Twine-style JSON export into the internal graph the
// dialogue engine consumes.

import { isEngineCommandBody } from "./commands.js";
//
// Input passage:
//   { name: "x", text: "...body...", links: [{ name, link }] }
//
// Output passage:
//   { name, steps: [{ type: "command"|"line", speaker?, text? }], choices: [{label, target}] }
//
// Rules (per agents.md):
//   * each non-empty line of body = one step
//   * lines starting with `//` are commands
//   * lines like `id: text` set the speaker to `id` (lowercased)
//   * lines without `id:` are narrator
//   * blank lines between two lines of the same speaker may split paragraphs
//     — we treat each non-empty line as its own step; that's the same UX.

const SPEAKER_RE = /^([\p{L}\p{N}_]+)\s*:\s*(.*)$/u;

/** Build a {passageName: parsedPassage} map from the raw story JSON. */
export function buildGraph(rawStory) {
  if (!rawStory || !Array.isArray(rawStory.passages)) {
    throw new Error("[twine] story JSON must have a `passages` array");
  }
  const graph = Object.create(null);
  for (const p of rawStory.passages) {
    graph[p.name] = parsePassage(p);
  }
  graph.__order__ = rawStory.passages.map(p => p.name);
  return graph;
}

function parsePassage(p) {
  const text = String(p.text || "");
  const lines = text.split(/\r?\n/);

  const steps = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("//")) {
      const body = line.slice(2).trim();
      if (!body) continue;
      if (!isEngineCommandBody(body)) continue;
      steps.push({ type: "command", text: body });
      continue;
    }

    const m = line.match(SPEAKER_RE);
    if (m) {
      const speaker = m[1].toLowerCase();
      const said = m[2];
      steps.push({ type: "line", speaker, text: said });
    } else {
      steps.push({ type: "line", speaker: "narrator", text: line });
    }
  }

  const choices = (p.links || []).map(l => ({
    label: l.name,
    target: l.link,
  }));

  return { name: p.name, steps, choices };
}

/** Pretty error to surface in the panel if a passage is missing. */
export function passageOrThrow(graph, name) {
  const p = graph[name];
  if (!p) throw new Error(`[twine] passage not found: ${name}`);
  return p;
}

/**
 * Migration helper (Material 3 rewrite): line-ending-safe literal replacements in source files.
 *
 *   bun scripts/md3-edit.ts <spec.json>
 *
 * spec: { "files": { "<path>": [["from", "to"], …] } }. Each `from` must occur (else the run fails before writing
 * anything); every occurrence is replaced. Files keep their own line endings.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Spec = { files: Record<string, Array<[string, string]>> };

export function applyEdits(spec: Spec): void {
  const results: Array<[string, string, string]> = [];
  for (const [path, pairs] of Object.entries(spec.files)) {
    const raw = readFileSync(path, "utf8");
    const crlf = raw.includes("\r\n");
    let text = raw.replace(/\r\n/g, "\n");
    for (const [from, to] of pairs) {
      const needle = from.replace(/\r\n/g, "\n");
      if (!text.includes(needle)) throw new Error(`${path}: not found: ${needle.slice(0, 100)}`);
      text = text.split(needle).join(to.replace(/\r\n/g, "\n"));
    }
    results.push([path, crlf ? text.replace(/\n/g, "\r\n") : text, raw]);
  }
  for (const [path, text, raw] of results) if (text !== raw) writeFileSync(path, text);
}

if (import.meta.main) {
  const specPath = process.argv[2];
  if (!specPath) throw new Error("usage: bun scripts/md3-edit.ts <spec.json>");
  applyEdits(JSON.parse(readFileSync(specPath, "utf8")) as Spec);
  console.log(`[md3-edit] applied ${specPath}`);
}

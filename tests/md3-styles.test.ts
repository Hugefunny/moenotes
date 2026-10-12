import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const styles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? styles(`${dir}/${entry.name}`) : entry.name.endsWith(".css") ? [`${dir}/${entry.name}`] : []));

describe("material 3 stylesheets", () => {
  test("no custom property is defined in terms of itself (it would resolve to nothing)", () => {
    for (const file of styles("src/styles")) {
      const css = readFileSync(file, "utf8");
      for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*var\(\s*(--[a-z0-9-]+)\s*[,)]/gi)) {
        expect(`${file}: ${match[1]}`).not.toBe(`${file}: ${match[2]}`);
      }
    }
  });

  test("the M3 typefaces resolve to the site font stacks", () => {
    const tokens = readFileSync("src/styles/md3/tokens.css", "utf8");
    expect(tokens).toMatch(/--md-ref-typeface-brand:\s*var\(--mn-font-display\)/);
    expect(tokens).toMatch(/--md-ref-typeface-plain:\s*var\(--mn-font-body\)/);
    const base = readFileSync("src/styles/tokens.css", "utf8");
    expect(base).toMatch(/--mn-font-display:\s*"Inter"/);
    expect(base).toMatch(/--mn-font-body:\s*"Inter"/);
  });
});

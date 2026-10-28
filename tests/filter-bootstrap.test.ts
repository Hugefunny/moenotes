import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { buildFilterBootstrapScript } from "../src/lib/filter/bootstrap";
import { storageKeys } from "../src/config/storage";

function run(stored: string | null, opensDocked: boolean) {
  const dataset: Record<string, string> = {};
  runInNewContext(buildFilterBootstrapScript(true), {
    sessionStorage: { getItem: (key: string) => (key === storageKeys.filterDrawerOpen ? stored : null) },
    window: { matchMedia: () => ({ matches: opensDocked }) },
    document: { documentElement: { dataset } },
  });
  return dataset;
}

describe("the filter button's visibility is decided before the first paint", () => {
  test("a wide window opens the docked sheet by itself, so the button starts hidden", () => {
    expect(run(null, true)).toEqual({ filterOpen: "true" });
  });

  test("a narrower window starts closed, with the button showing", () => {
    expect(run(null, false)).toEqual({ filterOpen: "false" });
  });

  test("a stored choice wins over the width", () => {
    expect(run("true", false)).toEqual({ filterOpen: "true" });
    expect(run("false", true)).toEqual({ filterOpen: "false" });
  });

  test("pages without a filter sheet get no script at all", () => {
    expect(buildFilterBootstrapScript(false)).toBe("");
  });

  test("the script is valid JavaScript and reads the stored key", () => {
    expect(() => new Function(buildFilterBootstrapScript(true))).not.toThrow();
    expect(buildFilterBootstrapScript(true)).toContain(JSON.stringify(storageKeys.filterDrawerOpen));
  });
});

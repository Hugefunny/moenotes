import { describe, expect, test } from "bun:test";
import { migrateSource } from "../scripts/codemod-md3-tokens";

describe("material 3 token codemod", () => {
  test("rewrites legacy color utilities to M3 roles, keeping variants and alpha", () => {
    expect(migrateSource(`<div className="bg-[var(--mn-paper)] text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] border-[var(--mn-border)]/20" />`, "markup"))
      .toBe(`<div className="bg-surface-container-low text-on-surface-variant hover:bg-surface-container-highest border-outline-variant/20" />`);
    expect(migrateSource(`className="bg-[var(--mn-accent-deep)] text-[var(--mn-paper)]"`, "markup")).toBe(`className="bg-primary text-on-primary"`);
    expect(migrateSource(`className="border-[color-mix(in_srgb,var(--mn-pink)_70%,transparent)]"`, "markup")).toBe(`className="border-category1/70"`);
  });

  test("drops stamp shadows and legacy helpers, maps elevations and shapes", () => {
    expect(migrateSource(`className="mn-focus mn-stamp-press rounded-3xl border-[1.5px] shadow-[var(--mn-shadow-stamp-sm)] hover:shadow-[var(--mn-shadow-stamp)]"`, "markup"))
      .toBe(`className="md3-state rounded-shape-lg border hover:shadow-elevation-1"`);
  });

  test("rewrites plain var() references and leaves layout variables alone", () => {
    expect(migrateSource(`.x { color: var(--mn-rose); width: var(--mn-sidebar-offset); font-family: var(--mn-font-note); }`, "css"))
      .toBe(`.x { color: var(--md-sys-color-error); width: var(--mn-sidebar-offset); font-family: var(--md-ref-typeface-mono); }`);
    expect(migrateSource(`const c = "var(--mn-mint)";`, "markup")).toBe(`const c = "var(--md-sys-color-success)";`);
  });
});

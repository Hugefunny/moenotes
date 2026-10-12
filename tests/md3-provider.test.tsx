import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import Button from "@mui/material/Button";
import { Md3Provider, md3ThemeVariablesCss } from "../src/components/md3/Md3Provider";

function styles(html: string): string[] {
  return [...html.matchAll(/<style data-emotion="css [^"]*"[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1]!);
}

describe("Material 3 provider (server render of an island)", () => {
  test("component styles are inlined inside the mui cascade layer", () => {
    const html = renderToString(<Md3Provider><Button variant="tonal">Save</Button></Md3Provider>);
    const css = styles(html);
    expect(css.length).toBeGreaterThan(0);
    for (const rule of css) expect(rule.startsWith("@layer mui{")).toBe(true);
    // M3 tonal button: secondary container, full shape, 40dp.
    expect(css.join("")).toContain("var(--md-sys-color-secondary-container)");
    expect(css.join("")).toContain("min-height:40px");
  });

  test("every render gets its own cache, so later pages still carry their styles", () => {
    const first = renderToString(<Md3Provider><Button>One</Button></Md3Provider>);
    const second = renderToString(<Md3Provider><Button>One</Button></Md3Provider>);
    expect(styles(first).length).toBeGreaterThan(0);
    expect(styles(second).length).toBe(styles(first).length);
  });

  test("islands do not repeat the theme variables; the page head carries them once", () => {
    const html = renderToString(<Md3Provider><Button>One</Button></Md3Provider>);
    expect(html).not.toContain("--mui-palette-primary-main:");
    const vars = md3ThemeVariablesCss();
    expect(vars).toContain('[data-theme="dark"]');
    expect(vars).toContain("--mui-palette-primary-main:");
  });
});

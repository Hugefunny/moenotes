import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import BrandLogo from "../src/components/shared/BrandLogo";

const publicAsset = (name: string) =>
  readFileSync(new URL(`../public/assets/brand/${name}`, import.meta.url), "utf8");

describe("brand signature", () => {
  test("both variants travel in the markup, so no page load waits for a revalidated asset", () => {
    const html = renderToString(<BrandLogo className="mn-brand-shell" />);
    // `/assets/` answers no-cache: as a URL the mark revalidates on every navigation and the capsule paints empty.
    expect(html).not.toContain("/assets/brand/");
    const sources = [...html.matchAll(/src="(data:image\/svg\+xml,[^"]*)"/g)].map((match) => match[1]!);
    expect(sources.length).toBe(2);
    const [ink, starlight] = sources.map((source) => decodeURIComponent(source.slice("data:image/svg+xml,".length)));
    expect(ink).toBe(publicAsset("moenotes-signature.svg"));
    expect(starlight).toBe(publicAsset("moenotes-signature-light.svg"));
  });

  test("the accessible name sits on the wrapper, and the decorative images stay hidden", () => {
    const html = renderToString(<BrandLogo />);
    expect(html).toContain('role="img" aria-label="Moenotes"');
    expect(html.match(/alt=""/g)?.length).toBe(2);
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
  });
});

import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import Fab from "@mui/material/Fab";
import { Md3Provider } from "../src/components/md3/Md3Provider";

const css = (html: string) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("");

describe("material 3 FAB", () => {
  test("the default FAB is the M3 standard 56dp size, never the 96dp large FAB", () => {
    const styles = css(renderToString(<Md3Provider><Fab aria-label="Up">+</Fab></Md3Provider>));
    expect(styles).not.toContain("width:96px");
    expect(styles).toContain("width:56px");
  });

  test("an extended FAB sizes to its label instead of the circle", () => {
    const styles = css(renderToString(<Md3Provider><Fab variant="extended">Filter cards</Fab></Md3Provider>));
    // Doubled selector (&&) so it outranks the circular size rules.
    expect(styles).toMatch(/(\.css-[a-z0-9-]+)\1\{[^}]*width:auto/i);
  });
});

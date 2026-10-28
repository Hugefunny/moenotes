import { describe, expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { buildAccountBootstrapScript } from "../src/lib/account/bootstrap";
import { storageKeys } from "../src/config/storage";

interface RunResult {
  dataset: Record<string, string>;
  style: Record<string, string>;
}

function run(stored: string | null): RunResult {
  const dataset: Record<string, string> = {};
  const style: Record<string, string> = {};
  runInNewContext(buildAccountBootstrapScript(), {
    localStorage: { getItem: (key: string) => (key === storageKeys.accountState ? stored : null) },
    document: {
      documentElement: {
        dataset,
        style: { setProperty: (name: string, value: string) => { style[name] = value; } },
      },
    },
  });
  return { dataset, style };
}

describe("the drawer's account row is decided before the first paint", () => {
  test("a signed-in reader gets their own row, with the cached name and initial in place", () => {
    const { dataset, style } = run(JSON.stringify({ status: "signed-in", name: "alice" }));
    expect(dataset.account).toBe("signed-in");
    // CSS custom properties carry the quoted string, so `content: var(--mn-account-name)` renders it verbatim.
    expect(style["--mn-account-name"]).toBe(JSON.stringify("alice"));
    expect(style["--mn-account-initial"]).toBe(JSON.stringify("A"));
  });

  test("a signed-in reader without a name still gets the user row", () => {
    const { dataset, style } = run(JSON.stringify({ status: "signed-in", name: "" }));
    expect(dataset.account).toBe("signed-in");
    expect(style).toEqual({});
  });

  test("a deployment without the account API hides the row instead of showing a link that vanishes", () => {
    expect(run(JSON.stringify({ status: "unavailable" })).dataset.account).toBe("unavailable");
  });

  test("signed-out and first visits keep the server-rendered sign-in row", () => {
    expect(run(JSON.stringify({ status: "signed-out" })).dataset).toEqual({});
    expect(run(null).dataset).toEqual({});
  });

  test("a malformed record leaves the default row alone", () => {
    for (const stored of ["not json", "[]", "null", "42", JSON.stringify({ status: "signed-in" }).slice(0, 5)]) {
      expect(() => run(stored)).not.toThrow();
      expect(run(stored).dataset).toEqual({});
    }
  });

  test("storage that throws leaves the row alone", () => {
    const dataset: Record<string, string> = {};
    expect(() =>
      runInNewContext(buildAccountBootstrapScript(), {
        localStorage: {
          getItem() {
            throw new Error("blocked");
          },
        },
        document: { documentElement: { dataset, style: { setProperty() {} } } },
      }),
    ).not.toThrow();
    expect(dataset).toEqual({});
  });

  test("the script is valid JavaScript and reads the stored key", () => {
    expect(() => new Function(buildAccountBootstrapScript())).not.toThrow();
    expect(buildAccountBootstrapScript()).toContain(JSON.stringify(storageKeys.accountState));
  });
});

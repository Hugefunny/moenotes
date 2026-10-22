import { expect, test } from "bun:test";
import { routeRegistry } from "../src/config/routes";
import type { AppRoute } from "../src/types/route";

function flatten(routes: readonly AppRoute[]): AppRoute[] {
  return routes.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

test("the retired room tool is absent from the shared navigation, search and page registry", () => {
  const routes = flatten(routeRegistry);
  expect(routes.some((route) => route.path === "/tools/room-check" || route.id === "room-check")).toBe(false);
  expect(routes.some((route) => route.path === "/tools/deck")).toBe(true);
  expect(routes.some((route) => route.path === "/account")).toBe(true);
});

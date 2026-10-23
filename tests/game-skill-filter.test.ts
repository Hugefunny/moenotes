import { expect, test } from "bun:test";
import { liveCategory, supportCategories } from "../src/lib/filter/skill-category";
import { EMPTY_CARD_FILTERS, matchesCardFilters, parseCardFilterState, type CardFilterSubject } from "../src/lib/filter/card-filter";
const card: CardFilterSubject = { id: 1, title: "x", rarity: 4, cardType: 1, bandId: 1, bandName: "x", characters: [], searchText: "x", skillCategories: [2,3], skillMissions: [3] };
test("game categories use the native explicit category heading", () => {
 expect(liveCategory("【シンプル】score")).toEqual([1]);
 expect(liveCategory("【ライフ】score")).toEqual([2]);
 expect(liveCategory("【判定】score")).toEqual([3]);
 expect(liveCategory("unknown")).toEqual([]);
 expect(supportCategories([2,3], 17)).toEqual([2,3]);
 expect(supportCategories([], 17)).toEqual([1]);
});
test("same-group OR, cross-group AND, none, reset and stored state", () => {
 expect(matchesCardFilters(card, {...EMPTY_CARD_FILTERS, skillCategories:[1,2],skillMissions:[3]})).toBe(true);
 expect(matchesCardFilters(card, {...EMPTY_CARD_FILTERS, skillCategories:[1]})).toBe(false);
 expect(matchesCardFilters(card, {...EMPTY_CARD_FILTERS, skillMissions:[1]})).toBe(false);
 expect(matchesCardFilters(card, {...EMPTY_CARD_FILTERS, skillCategories:[0]})).toBe(false);
 expect(matchesCardFilters(card, EMPTY_CARD_FILTERS)).toBe(true);
 const state={...EMPTY_CARD_FILTERS,skillCategories:[2],skillMissions:[3]};
 expect(parseCardFilterState(JSON.stringify(state))).toEqual(state);
 expect(parseCardFilterState('{}')).toEqual(EMPTY_CARD_FILTERS);
});

test("missing support categories fall back to native effect icons", () => {
  expect(supportCategories([], 10)).toEqual([3]);
  expect(supportCategories([], 14)).toEqual([2]);
  expect(supportCategories([], 7)).toEqual([1]);
});

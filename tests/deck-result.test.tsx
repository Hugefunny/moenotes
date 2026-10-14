import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckResult from "../src/components/deck/DeckResult";
import type { BoxCatalog } from "../src/components/box/BoxManager";
import { createBox } from "../src/lib/box/model";
import { parseDeckAnswer, type DeckAnswer, type DeckIssue } from "../src/lib/deck/answer";
import { t } from "../src/i18n";
import type { AppLocale } from "../src/config/locales";

const render = (locale: AppLocale, errors: DeckIssue[]) => {
  const box = createBox("tw", "box", 1);
  box.save = { server: "intl", accountId: "20000000001", sha256: "a".repeat(64), uploadedAt: 1 };
  const answer: DeckAnswer = { final: true, status: "invalid", missing: [], errors, result: null };
  return renderToStaticMarkup(<DeckResult locale={locale} goal="power" rateBasis={null} stale={false} timeLimit={30} box={box} catalog={{ members: [], snaps: [] }} linked busy={false}
    job={{ status: "done", key: "input", answer, rate: null, stopped: false }} onStop={() => {}} onRerun={() => {}} onEditCard={() => {}} onPlayer={() => {}} onAnswerAll={() => {}} />);
};
test("grouped memory validation errors retain their diagnostic path, code and reason", () => {
  const error = { path: "_player._memory._members[0]._unlocked", code: "invalid_type", message: "Expected a boolean" };
  const html = render("en-US", [error]);
  expect(html).toContain(error.path); expect(html).toContain(error.code); expect(html).toContain(error.message);
  expect(html).toContain('class="dr-issue-details"');
});
test("unrecognized linked save records name calculation data separately in the core locales", () => {
  for (const locale of ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const) {
    const html = render(locale, [{ path: "_player._memory._supports[0]._id", code: "unknown_id", message: "Unknown snap identity" }]);
    expect(html).toContain(t(locale, "deckWorkspace.solver.statusNote.invalidDataLinked"));
    expect(html).toContain("_player._memory._supports[0]._id");
  }
});

const team = (rank: number, members: number[], score: number) => ({ rank, rankCertified: true, leader: { member: members[2], snap: null },
  others: members.filter((_, slot) => slot !== 2).map(member => ({ member, snap: null })), power: 100, value: { score, payoff: null },
  orders: { count: 120, min: { score: score - 30, order: [5, 4, 3, 2, 1] }, median: { score: score - 5, order: [2, 1, 3, 4, 5] }, max: { score: score + 20, order: [1, 2, 3, 4, 5] } },
  layout: { members, snaps: [null, null, null, null, null] as (number | null)[] } });
test("an average result opens the first team, folds the others and shows where its skill orders fall", () => {
  const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
    goal: { kind: "freeLive" }, metric: { kind: "score" }, aggregation: "expected", phase: "done", elapsedMs: 10, optimality: { proven: true },
    teams: [team(1, [1, 2, 3, 4, 5], 1000), team(2, [1, 2, 3, 4, 6], 990)] } }));
  const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="free" rateBasis={null} stale={false} timeLimit={60} box={null} catalog={{ members: [], snaps: [] }} linked={false} busy={false}
    job={{ status: "done", key: "expected", answer, rate: null, stopped: false }} onStop={() => {}} onRerun={() => {}} onEditCard={() => {}} onPlayer={() => {}} onAnswerAll={() => {}} />);
  expect((html.match(/<details open="">/g) ?? []).length).toBe(1);
  expect((html.match(/<details>/g) ?? []).length).toBe(1);
  expect(html).toContain("Skill order");
  expect(html).toContain("120 orders");
  for (const label of ["Best", "Median", "Worst", "Average"]) expect(html).toContain(label);
  expect(html).toContain('aria-label="1 → 2 → 3 → 4 → 5"');
  expect(html).toContain('aria-label="5 → 4 → 3 → 2 → 1"');
  expect(html).toContain("1,020");
  expect(html).toContain("−10");
  expect(html).toContain("1 slots differ from #1");
});
test("a result names its member cards and Snaps by card title, never by character", () => {
  const members = [1, 2, 3, 4, 5, 6].map(id => ({ id, assetId: id, characterId: id, bandId: 1, rarity: 4, cardType: "cool", title: `Card title ${id}`, characterName: `Character ${id}` })) as unknown as BoxCatalog["members"];
  const snaps = [{ id: 11, assetId: 11, rarity: 4, cardType: 1, title: "Snap title 11", name: "Character 11", characterIds: [], characters: [] }] as unknown as BoxCatalog["snaps"];
  const first = team(1, [1, 2, 3, 4, 5], 1000);
  first.layout.snaps = [11, null, null, null, null];
  const answer = parseDeckAnswer(JSON.stringify({ format: "ournotes-deck.account-recommendation/1", final: true, status: "ok", result: {
    goal: { kind: "freeLive" }, metric: { kind: "score" }, aggregation: "expected", phase: "done", elapsedMs: 10, optimality: { proven: true },
    teams: [first, team(2, [1, 2, 3, 4, 6], 990)] } }));
  const html = renderToStaticMarkup(<DeckResult locale="en-US" goal="free" rateBasis={null} stale={false} timeLimit={60} box={null} catalog={{ members, snaps }} linked={false} busy={false}
    job={{ status: "done", key: "expected", answer, rate: null, stopped: false }} onStop={() => {}} onRerun={() => {}} onEditCard={() => {}} onPlayer={() => {}} onAnswerAll={() => {}} />);
  expect(html).toContain('aria-label="Card title 1 → Card title 2 → Card title 3 → Card title 4 → Card title 5"');
  expect(html).toContain('<span class="dr-step-name" aria-hidden="true">Card title 3</span>');
  expect(html).toContain('<strong title="Card title 1">Card title 1</strong>');
  expect(html).toContain('<strong title="Snap title 11">Snap title 11</strong>');
  expect(html.replace(/ alt="[^"]*"/g, "")).not.toContain("Character ");
});

import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import CardStats from "../src/components/box/CardStats";
import { answerField, createCard } from "../src/lib/box/model";

const answered = (kind: "member" | "snap", values: Record<string, number>) => {
  const card = createCard(kind, "k", "1");
  for (const [name, value] of Object.entries(values)) card.fields[name as keyof typeof card.fields] = answerField(card.fields[name as keyof typeof card.fields], { id: name, value, source: "manual", at: 1 });
  return card;
};
test("a member's stats list every value, mark finished steps and dash unknown ones", () => {
  const html = renderToStaticMarkup(<CardStats locale="en-US" card={answered("member", { level: 70, awake: 5, rank: 2, liveSkillLevel: 5 })} />);
  expect((html.match(/<dt>/g) ?? []).length).toBe(5);
  expect((html.match(/data-max="true"/g) ?? []).length).toBe(2);
  expect(html).toContain('<dd aria-label="Unknown">—</dd>');
  expect(html).toContain("<dd>70</dd>");
});
test("a Snap's stats show its level and rank only", () => {
  const html = renderToStaticMarkup(<CardStats locale="en-US" card={answered("snap", { level: 50, rank: 5 })} />);
  expect((html.match(/<dt>/g) ?? []).length).toBe(2);
  expect(html).toContain('data-field="rank" data-max="true"');
});

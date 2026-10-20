import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { formatBandItemEffectPercent } from "@/lib/band-items/assets";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { LEADER_SLOT } from "@/lib/room-check/summary";
import type { RoomFormation, RoomPlayer, RoomUnit } from "@/lib/room-check/types";
import { MemberFace, SupportFace, memberName, supportName, type AssetUrl } from "./CardFace";

interface Props {
  locale: AppLocale;
  player: RoomPlayer & { formation: RoomFormation };
  cards: DeckCardLookup;
  assetUrl: AssetUrl;
  id?: string;
  /** Name the player above the team, where several teams show at once. */
  titled: boolean;
}

/**
 * One player's team: a card per deck slot (the leader in the middle) with its art, Snap and every value the room
 * shares as small tiles. Five cards side by side when there is room, wrapping onto more rows when there is not.
 */
export default function TeamSheet({ locale, player, cards, assetUrl, id, titled }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.formation.${key}`, values);
  const { formation } = player;
  const position = new Map(formation.order.map((slot, index) => [slot, index + 1]));
  const ordered = formation.order.length === formation.units.length && formation.order.some((slot, index) => slot !== index);
  const name = player.name || t(locale, "roomCheck.player.unnamed");
  return (
    <section id={id} className="rc-sheet" data-color={player.color === null ? undefined : player.color % 5} aria-label={tr("caption", { name })}>
      <div className="rc-sheet-head">
        {titled && <h4 className="rc-sheet-title">{tr("caption", { name })}</h4>}
        <dl className="rc-team-totals">
          <div><dt>{tr("totalCharacterRank")}</dt><dd>{formation.totalCharacterRank}</dd></div>
          <div><dt>{tr("vipRank")}</dt><dd>{formation.vipRank}</dd></div>
        </dl>
      </div>
      <ol className="rc-units">
        {formation.units.map((unit, slot) => <UnitCard key={slot} locale={locale} unit={unit} slot={slot} cards={cards} assetUrl={assetUrl}
          order={ordered ? position.get(slot) ?? null : null} />)}
      </ol>
    </section>
  );
}

function UnitCard({ locale, unit, slot, cards, assetUrl, order }: {
  locale: AppLocale; unit: RoomUnit; slot: number; cards: DeckCardLookup; assetUrl: AssetUrl; order: number | null;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.formation.${key}`, values);
  const leader = slot === LEADER_SLOT;
  const gear = unit.bandItem;
  const percent = (value: number) => `+${formatBandItemEffectPercent(value, locale)}%`;
  const geared = gear.performance > 0 || gear.technique > 0 || gear.visual > 0;
  return (
    <li className="rc-unit" data-leader={leader || undefined}>
      <div className="rc-unit-head">
        <span className="rc-slot-tag">{leader ? tr("leader") : tr("slot", { n: slot + 1 })}</span>
        {order !== null && <span className="rc-unit-order" title={tr("order")}>{tr("orderShort", { n: order })}</span>}
      </div>
      <MemberFace locale={locale} id={unit.cardId} cards={cards} assetUrl={assetUrl} level={unit.level} rank={unit.rank} />
      <strong className="rc-unit-name" title={memberName(cards, unit.cardId)}>{memberName(cards, unit.cardId)}</strong>
      <dl className="rc-tiles">
        <Tile label={tr("short.awake")} title={tr("awake")} value={unit.awake} />
        <Tile label={tr("short.characterRank")} title={tr("characterRank")} value={unit.characterRank} />
        <Tile label={tr("short.live")} title={tr("skills.live")} value={unit.skills.live} />
        <Tile label={tr("short.gekisou")} title={tr("skills.gekisou")} value={unit.skills.gekisou} />
        {/* Only the leader's leader skill takes effect. */}
        <Tile label={tr("short.leader")} title={tr("skills.leader")} value={unit.skills.leader} muted={!leader} />
        <Tile label={tr("short.rank")} title={tr("rank")} value={unit.rank} />
      </dl>
      {geared && <p className="rc-gear" title={tr("bandItemTitle", { performance: percent(gear.performance), technique: percent(gear.technique), visual: percent(gear.visual) })}>
        <span className="sr-only">{tr("bandItem")}</span>
        {(["performance", "technique", "visual"] as const).map((stat) => <span key={stat} data-stat={stat} data-zero={gear[stat] === 0 || undefined}>{percent(gear[stat])}</span>)}
      </p>}
      <div className="rc-unit-snap">
        {unit.support
          ? <SupportFace locale={locale} id={unit.support.cardId} cards={cards} assetUrl={assetUrl} level={unit.support.level} rank={unit.support.rank} />
          : <span className="rc-face rc-face-empty" data-kind="support">{tr("noSupport")}</span>}
        {unit.support && <>
          <span className="rc-unit-name rc-unit-snap-name" title={supportName(cards, unit.support.cardId)}>{supportName(cards, unit.support.cardId)}</span>
          <dl className="rc-tiles">
            <Tile label={tr("short.snapSkills")} title={tr("supportSkills")} value={unit.support.skills.join("/")} />
            <Tile label={tr("short.snapGekisou")} title={tr("supportGekisouSkills")} value={unit.support.gekisouSkills.join("/")} />
          </dl>
        </>}
      </div>
    </li>
  );
}

function Tile({ label, title, value, muted = false }: { label: string; title: string; value: string | number; muted?: boolean }) {
  return <div className="rc-tile" title={title} data-muted={muted || undefined}><dt>{label}</dt><dd>{value}</dd></div>;
}

import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getCardFrameUrl, getCardRankIconUrl, getCardThumbnailUrl, getCharacterFaceIconUrl } from "@/lib/cards/assets";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { getSupportCardFrameUrl, getSupportCardRankIconUrl, getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";

export type AssetUrl = (url: string | undefined | null) => string;

/** A member card as its 3:4 thumbnail with frame; `level` and the rank icon sit on the art unless `compact`. */
export function MemberFace({ locale, id, cards, assetUrl, level, rank, compact = false }: {
  locale: AppLocale; id: number; cards: DeckCardLookup; assetUrl: AssetUrl; level?: number; rank?: number; compact?: boolean;
}) {
  const entry = cards.member[String(id)];
  const [fallback, setFallback] = useState(false);
  if (!entry) return <UnknownFace label={t(locale, "roomCheck.formation.unknownCard", { id })} kind="member" />;
  const [assetId, characterId, rarity, , title] = entry;
  return (
    <span className="rc-face" data-kind="member" title={title}>
      <img src={assetUrl(fallback ? getCharacterFaceIconUrl(characterId) : getCardThumbnailUrl(assetId))} alt={title} loading="lazy" onError={() => setFallback(true)} />
      <img className="rc-face-frame" src={getCardFrameUrl(rarity)} alt="" aria-hidden="true" />
      {!compact && level !== undefined && <span className="rc-face-level">{t(locale, "music.ranking.level", { level })}</span>}
      {!compact && rank !== undefined && rank > 0 && <img className="rc-face-rank" src={getCardRankIconUrl(rank)} alt={t(locale, "roomCheck.formation.rankValue", { n: rank })} />}
    </span>
  );
}

/** A Snap as its 16:9 thumbnail with frame, level and limit-break icon. */
export function SupportFace({ locale, id, cards, assetUrl, level, rank }: {
  locale: AppLocale; id: number; cards: DeckCardLookup; assetUrl: AssetUrl; level?: number; rank?: number;
}) {
  const entry = cards.support[String(id)];
  if (!entry) return <UnknownFace label={t(locale, "roomCheck.formation.unknownCard", { id })} kind="support" />;
  const [assetId, rarity, , title] = entry;
  const frame = getSupportCardFrameUrl(rarity);
  return (
    <span className="rc-face" data-kind="support" title={title}>
      <img src={assetUrl(getSupportCardThumbnailUrl(assetId))} alt={title} loading="lazy" />
      {frame && <img className="rc-face-frame" src={frame} alt="" aria-hidden="true" />}
      {level !== undefined && level > 0 && <span className="rc-face-level">{t(locale, "music.ranking.level", { level })}</span>}
      {rank !== undefined && rank > 0 && <img className="rc-face-rank" src={getSupportCardRankIconUrl(rank)} alt={t(locale, "roomCheck.formation.rankValue", { n: rank })} />}
    </span>
  );
}

/** A card the site's MasterData does not know yet. */
function UnknownFace({ label, kind }: { label: string; kind: "member" | "support" }) {
  return <span className="rc-face rc-face-unknown" data-kind={kind} title={label}><span>{label}</span></span>;
}

/** The member card's name, or its id when MasterData does not know it. */
export function memberName(cards: DeckCardLookup, id: number): string {
  return cards.member[String(id)]?.[4] ?? `#${id}`;
}

export function supportName(cards: DeckCardLookup, id: number): string {
  return cards.support[String(id)]?.[3] ?? `#${id}`;
}

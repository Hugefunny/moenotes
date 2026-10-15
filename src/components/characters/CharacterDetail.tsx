import { SiriusIcon } from "@/components/shared/SiriusLoader";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import ServerScope from "@/components/shared/ServerScope";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import Modal from "@/components/shared/Modal";
import {
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  getCharacterSpriteUrl,
  getCharacterThumbnailUrl,
  getCharacterFaceIconUrl,
  getCharacterBoardIconUrl,
} from "@/lib/cards/assets";
import {
  type CardViewModel,
} from "@/lib/cards/data";
import {
  type CharacterProgressionData,
  type CharacterViewModel,
} from "@/lib/characters/data";
import { CharacterSectionTabs, CostumesPanel, RankRewardsPanel, useCharacterSection } from "@/components/characters/CharacterSections";
import CharacterVoicesSection from "@/components/characters/CharacterVoices";
import { BondPartnersPanel, CharacterMissionsPanel, RelatedPanels } from "@/components/characters/CharacterExtraSections";
import type { CharacterExtrasData } from "@/lib/characters/relations";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  characterId: number;
  initialData: ServerFacetedValue<DetailData>;
  progressionData: CharacterProgressionData | null;
  /** Bonds, missions and related entries (build-character-extras.ts). */
  extrasData: ServerFacetedValue<CharacterExtrasData>;
  servers: GameServer[];
}

interface DetailData {
  character: CharacterViewModel | null;
  cards: CardViewModel[];
}

interface AssetPreview {
  id: "sprite" | "thumbnail" | "face" | "board";
  label: string;
  description: string;
  url: string;
  transparent?: boolean;
  compact?: boolean;
}

type CopyState = "idle" | "copying" | "success" | "error";

/** The character as the page's server has it (docs/servers.md). */
export default function CharacterDetail({ locale, initialData, progressionData, extrasData, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const extras = useMemo(() => moveReleaseUrls(valueForServer(extrasData, server), entityServer(extrasData, server)), [extrasData, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = servers.length > 1 ? <GameServerSwitch locale={locale} value={server} onChange={pickServer} servers={servers} /> : null;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers} hideSwitch>
      <CharacterDetailView locale={locale} data={data} progression={progressionData} extras={extras} serverSwitch={serverSwitch} />
    </ServerScope>
  );
}

function CharacterDetailView({ locale, data, progression, extras, serverSwitch }: { locale: AppLocale; data: DetailData; progression: CharacterProgressionData | null; extras: CharacterExtrasData; serverSwitch: ReactNode }) {
  const assetUrl = useAssetUrl();
  const { showSpoiler, now } = useSpoilerSetting();
  const visibleCards = useMemo(() => {
    if (showSpoiler || now === null) return data.cards;
    return data.cards.filter((card) => !isSpoiler(card.startAt, now));
  }, [data.cards, showSpoiler, now]);
  const visibleExtras = useMemo(() => {
    if (showSpoiler || now === null) return extras;
    return {
      ...extras,
      supportCards: extras.supportCards.filter((card) => !isSpoiler(card.startAt, now)),
    };
  }, [extras, showSpoiler, now]);
  const [section, setSection] = useCharacterSection();
  const [selectedAsset, setSelectedAsset] = useState<AssetPreview | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [downloadState, setDownloadState] = useState<("idle" | "downloading" | "success")>("idle");
  const [activeAssetId, setActiveAssetId] = useState<AssetPreview["id"]>("sprite");

  const character = data.character;
  const characterNames = useMemo(() => new Map(extras.characters.map((entry) => [entry.id, entry.name])), [extras.characters]);

  const assets = useMemo<AssetPreview[]>(() => {
    if (!character) return [];
    return [
      { id: "sprite", label: t(locale, "characters.assets.sprite"), description: t(locale, "characters.assets.spriteDesc"), url: assetUrl(getCharacterSpriteUrl(character.id)), transparent: true },
      { id: "thumbnail", label: t(locale, "characters.assets.thumbnail"), description: t(locale, "characters.assets.thumbnailDesc"), url: assetUrl(getCharacterThumbnailUrl(character.id)) },
      { id: "face", label: t(locale, "characters.assets.face"), description: t(locale, "characters.assets.faceDesc"), url: assetUrl(getCharacterFaceIconUrl(character.id)), transparent: true, compact: true },
      { id: "board", label: t(locale, "characters.assets.board"), description: t(locale, "characters.assets.boardDesc"), url: assetUrl(getCharacterBoardIconUrl(character.id)), transparent: true, compact: true },
    ];
  }, [character, locale, assetUrl]);

  const closePreview = () => {
    setSelectedAsset(null);
    setCopyState("idle");
    setDownloadState("idle");
  };

  const copySelectedAsset = async () => {
    if (!selectedAsset) return;
    setCopyState("copying");
    try {
      const response = await fetch(selectedAsset.url);
      const blob = await response.blob();
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
        setCopyState("success");
      } else {
        await navigator.clipboard.writeText(selectedAsset.url);
        setCopyState("success");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(selectedAsset.url);
        setCopyState("success");
      } catch {
        setCopyState("error");
      }
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const handleDownload = async () => {
    if (!selectedAsset) return;
    setDownloadState("downloading");
    try {
      const response = await fetch(selectedAsset.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = selectedAsset.url.split("/").pop() || "download";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setDownloadState("success");
    } catch {
      window.open(selectedAsset.url, "_blank");
      setDownloadState("success");
    }
    setTimeout(() => setDownloadState("idle"), 1500);
  };

  if (!character) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12">
        <h1 className="text-headline-small text-on-surface">{t(locale, "characters.detailNotFound")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "characters.detailNotFoundDescription")}</p>
      </div>
    );
  }

  const previewActions = selectedAsset ? (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloadState === "downloading"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-outline-variant bg-surface-container-low text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
      >
        {downloadState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {downloadState === "downloading" && <SiriusIcon />}
        {downloadState === "success" && <svg className="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>
      <button
        type="button"
        onClick={copySelectedAsset}
        disabled={copyState === "copying"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-outline-variant bg-surface-container-low text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
      >
        {copyState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        {copyState === "copying" && <SiriusIcon />}
        {copyState === "success" && <svg className="h-4 w-4 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {copyState === "error" && <svg className="h-4 w-4 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
      </button>
    </>
  ) : null;

  const activeAsset = assets.find((asset) => asset.id === activeAssetId) ?? assets[0]!;

  return (
    <div className="w-full space-y-8">
      <CharacterHero locale={locale} character={character} serverSwitch={serverSwitch} />

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:items-start">
        {/* The images, one at a time, with the switch below the frame. */}
        <aside className="flex w-full flex-col gap-3 lg:sticky lg:top-24">
          <button
            type="button"
            onClick={() => setSelectedAsset(activeAsset)}
            className={`group relative block aspect-[3/4] w-full overflow-hidden rounded-shape-lg border border-outline-variant ${activeAsset.transparent ? "md3-transparency-grid bg-surface-container-high" : "bg-surface-container-high"}`}
            aria-label={t(locale, "characters.assets.open", { name: activeAsset.label })}
          >
            <img
              className={activeAsset.compact ? "absolute inset-0 m-auto max-h-full max-w-full object-contain p-8" : "h-full w-full object-cover object-top"}
              src={activeAsset.url}
              alt={activeAsset.label}
            />
            <span className="absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/10" aria-hidden="true">
              <svg className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" /></svg>
            </span>
          </button>
          <div className="md3-segmented self-center" role="group" aria-label={t(locale, "characters.assets.label")}>
            {assets.map((asset) => (
              <button key={asset.id} type="button" aria-pressed={asset.id === activeAsset.id} onClick={() => setActiveAssetId(asset.id)} className="md3-segment md3-state">
                {asset.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <CharacterSectionTabs locale={locale} value={section} onChange={setSection} />
          {section === "costumes" && <CostumesPanel locale={locale} costumes={progression?.costumes ?? []} />}
          {section === "voices" && <CharacterVoicesSection locale={locale} characterId={character.id} characterNames={characterNames} cards={visibleCards} />}
          {section === "bonds" && <>
            <BondPartnersPanel locale={locale} extras={extras} />
            <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.friendshipTitle")} groups={progression?.friendshipRewards ?? []} />
          </>}
          {section === "missions" && <CharacterMissionsPanel locale={locale} characterName={character.name} extras={extras} />}
          {section === "related" && <RelatedPanels locale={locale} cards={visibleCards} extras={visibleExtras} />}
          {section === "profile" && <>
            <dl className="md3-surface divide-y divide-outline-variant px-6 sm:px-8">
              <DetailRow label={t(locale, "characters.detailBand")} value={character.bandName} />
              <DetailRow
                label={t(locale, "characters.detailColor")}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border border-outline-variant" style={{ backgroundColor: character.mainColor }} />
                    <span className="font-[var(--md-ref-typeface-mono)] text-label-medium">{character.mainColor}</span>
                  </span>
                }
              />
              <DetailRow label={t(locale, "characters.detailPart")} value={character.bandPart} />
              <DetailRow label={t(locale, "characters.detailBirthday")} value={character.birthday} />
              {character.height && <DetailRow label={t(locale, "characters.detailHeight")} value={character.height} />}
              {character.school && (
                <DetailRow label={t(locale, "characters.detailSchool")} value={character.schoolClass ? `${character.school} ${character.schoolClass}` : character.school} />
              )}
              {character.hobby && <DetailRow label={t(locale, "characters.detailHobby")} value={character.hobby} />}
              {character.favoriteFood && <DetailRow label={t(locale, "characters.detailFavoriteFood")} value={character.favoriteFood} />}
              {character.constellation && <DetailRow label={t(locale, "characters.detailConstellation")} value={character.constellation} />}
              <DetailRow label={t(locale, "characters.detailVoiceActor")} value={character.voiceActor} />
            </dl>

            {character.description && (
              <div className="md3-surface px-6 py-5 sm:px-8 sm:py-6">
                <h2 className="text-title-large text-on-surface">{t(locale, "characters.profileTitle")}</h2>
                <p className="mt-3 max-w-[70ch] whitespace-pre-line text-body-large text-on-surface">{character.description}</p>
              </div>
            )}

            {/* The full card lists live in the related section; the profile keeps the counts. */}
            <div className="md3-surface flex flex-wrap items-center justify-between gap-3 px-6 py-4 sm:px-8">
              <p className="text-label-large text-on-surface">
                {t(locale, "characters.related.summary", { cards: visibleCards.length, supportCards: visibleExtras.supportCards.length, stories: extras.stories.length + extras.friendshipStories.length })}
              </p>
              <button type="button" onClick={() => setSection("related")} className="md3-state rounded-full border border-outline-variant px-4 py-1.5 text-label-medium text-primary">
                {t(locale, "characters.related.open")}
              </button>
            </div>

            <RankRewardsPanel locale={locale} title={t(locale, "characters.rewards.rankTitle")} groups={progression?.rankRewards ?? []} />
          </>}

          <a href={localizePath(getRoutePathById("characters"), locale)} className="md3-state inline-flex rounded-full border border-outline-variant px-6 py-2.5 text-label-large text-on-surface">
            {t(locale, "characters.backToList")}
          </a>
        </section>
      </div>

      <Modal
        isOpen={selectedAsset !== null}
        onClose={closePreview}
        title={selectedAsset?.label ?? ""}
        closeLabel={t(locale, "actions.close")}
        size={selectedAsset?.id === "face" || selectedAsset?.id === "board" ? "sm" : "md"}
        headerActions={previewActions}
      >
        {selectedAsset && (
          <div className={`w-full overflow-hidden rounded-shape-lg border border-outline-variant ${selectedAsset.transparent ? "md3-transparency-grid bg-surface-container-highest" : "bg-surface-container"}`}>
            <img
              className="mx-auto max-h-[65vh] w-full object-contain"
              src={selectedAsset.url}
              alt={selectedAsset.label}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * The page heading: the character's name with her band and part, beside a strap in her two colors (MasterCharacter's
 * main and sub color), and the server switch.
 */
function CharacterHero({ locale, character, serverSwitch }: { locale: AppLocale; character: CharacterViewModel; serverSwitch: ReactNode }) {
  const assetUrl = useAssetUrl();
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="mn-character-hero flex min-w-0 flex-col gap-2 pl-5" style={{ "--mn-strap-main": character.mainColor, "--mn-strap-sub": character.subColor } as CSSProperties}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-large text-on-surface-variant">
          <img className="block h-6 w-auto object-contain dark:hidden" src={assetUrl(getBandLogoUrl(character.bandId, locale))} alt="" aria-hidden="true" onError={(event) => { (event.target as HTMLElement).style.display = "none"; }} />
          <img className="hidden h-6 w-auto object-contain dark:block" src={assetUrl(getBandLogoWhiteUrl(character.bandId, locale))} alt="" aria-hidden="true" onError={(event) => { (event.target as HTMLElement).style.display = "none"; }} />
          <span>{character.bandName}</span>
          <span className="rounded-full border border-outline-variant px-2.5 text-label-medium leading-6 text-on-surface">{character.bandPart}</span>
        </p>
        <h1 className="text-display-small text-on-surface">{character.name}</h1>
        {character.enName && <p className="text-title-medium text-on-surface-variant">{character.enName}</p>}
        {character.catchCopy && <p className="mt-1 max-w-[52ch] text-body-large text-on-surface">{character.catchCopy}</p>}
      </div>
      {serverSwitch}
    </header>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5 text-body-large">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-on-surface">{value}</dd>
    </div>
  );
}

import SiriusLoader, { SiriusIcon } from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { formatMasterDay } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import Modal from "@/components/shared/Modal";
import {
  getSupportCardFullUrl,
  getSupportCardThumbnailUrl,
  getSupportCardSkillSpriteUrl,
  getSupportRarityIconUrl,
  getSupportCardTypeIconUrl,
} from "@/lib/support-cards/assets";
import {
  type SupportCardViewModel,
} from "@/lib/support-cards/data";
import {
  maxSupportCardBuild,
  supportCardLevelLimit,
  type SupportCardBuild,
  type SupportCardGrowth,
} from "@/lib/support-cards/growth";
import { levelParameters, maxSkillLevel, pickSkillLevel } from "@/lib/cards/growth";
import {
  type SkillLevelViewModel,
  type SkillViewModel,
} from "@/lib/cards/skills";
import {
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  getBandSmallIconUrl,
  getCharacterFaceIconUrl,
} from "@/lib/cards/assets";
import { LevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import CardMaterialsPanel from "@/components/cards/CardMaterialsPanel";
import type { CardMaterials } from "@/lib/cards/materials";

interface Props {
  locale: AppLocale;
  supportCardId: number;
  initialData: ServerFacetedValue<DetailData>;
  /** Limit break materials (build-card-materials.ts); null when no server has the card. */
  materials?: ServerFacetedValue<CardMaterials> | null;
  servers: GameServer[];
}

interface DetailData {
  card: SupportCardViewModel | null;
  skills: SkillViewModel[];
  growth: SupportCardGrowth;
}

interface AssetPreview {
  id: "full" | "thumbnail" | "sprite";
  label: string;
  description: string;
  url: string;
  transparent?: boolean;
  compact?: boolean;
}

type CopyState = "idle" | "copying" | "success" | "error";

function estimateTabWidth(label: string): number {
  let width = 24 + 3; // padding-x (px-3 = 12px * 2) + border (1.5px * 2)
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i);
    if (code > 127) {
      width += 12; // CJK character
    } else {
      width += 7.5; // Latin character
    }
  }
  return width;
}

/** The support card as the page's server has it (docs/servers.md). */
export default function SupportCardDetail({ locale, initialData, materials: facetedMaterials = null, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const data = useMemo(() => moveReleaseUrls(valueForServer(initialData, server), entityServer(initialData, server)), [initialData, server]);
  const materials = useMemo(() => facetedMaterials && moveReleaseUrls(valueForServer(facetedMaterials, server), entityServer(facetedMaterials, server)), [facetedMaterials, server]);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialData.servers}>
      <SupportCardDetailView locale={locale} data={data} materials={materials} />
    </ServerScope>
  );
}

function SupportCardDetailView({ locale, data, materials }: { locale: AppLocale; data: DetailData; materials: CardMaterials | null }) {
  const assetUrl = useAssetUrl();
  const timeZone = useDisplayTimeZone();
  const loading = false;
  const error = false;
  const [, setReloadKey] = useState(0);
  const [selectedAsset, setSelectedAsset] = useState<AssetPreview | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "success">("idle");

  const card = data.card;
  const growth = data.growth;
  const maxBuild = useMemo(() => maxSupportCardBuild(growth), [growth]);
  const [build, setBuild] = useState<SupportCardBuild>(maxBuild);
  const assets = useMemo<AssetPreview[]>(() => {
    if (!card) return [];
    return [
      {
        id: "full",
        label: t(locale, "cards.assets.full"),
        description: "1920 × 1080",
        url: assetUrl(getSupportCardFullUrl(card.assetId)),
      },
      {
        id: "thumbnail",
        label: t(locale, "cards.assets.thumbnail"),
        description: "512 × 288",
        url: assetUrl(getSupportCardThumbnailUrl(card.assetId)),
      },
      {
        id: "sprite",
        label: t(locale, "cards.assets.skillSprite"),
        description: "120 × 48",
        url: assetUrl(getSupportCardSkillSpriteUrl(card.assetId)),
        transparent: true,
        compact: true,
      },
    ];
  }, [card, locale, assetUrl]);

  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    setViewportWidth(window.innerWidth);
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    document.addEventListener("astro:page-load", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("astro:page-load", handleResize);
    };
  }, []);

  const containerWidth = useMemo(() => {
    const v = Math.min(1920, viewportWidth);
    if (v < 768) {
      return v - 32;
    }
    if (v < 1024) {
      return v - 336;
    }
    return Math.max(352, (v - 336) * 0.4);
  }, [viewportWidth]);

  const allTabs = useMemo(() => {
    if (!card) return [];
    return [
      { id: "full" as const, label: t(locale, "cards.assets.full") },
      { id: "thumbnail" as const, label: t(locale, "cards.assets.thumbnail") },
      { id: "sprite" as const, label: t(locale, "cards.assets.skillSprite") },
      { id: "info" as const, label: t(locale, "seo.supportCardDetail.title") },
    ];
  }, [card, locale]);

  const { topTabs, bottomTabs } = useMemo(() => {
    const top: typeof allTabs = [];
    const bottom: typeof allTabs = [];
    const maxAvailableWidth = containerWidth - 48;
    let currentTopWidth = 0;

    for (const tab of allTabs) {
      const tabWidth = estimateTabWidth(tab.label) + 4;
      if (currentTopWidth + tabWidth <= maxAvailableWidth) {
        top.push(tab);
        currentTopWidth += tabWidth;
      } else {
        bottom.push(tab);
      }
    }

    if (top.length === 0 && allTabs.length > 0) {
      top.push(allTabs[0]!);
      bottom.shift();
    }

    return { topTabs: top, bottomTabs: bottom };
  }, [allTabs, containerWidth]);

  const tabs = allTabs;

  const [activeTabId, setActiveTabId] = useState<string>("full");

  useEffect(() => {
    if (tabs.length > 0) {
      setActiveTabId((prev) => {
        const found = tabs.find((t) => t.id === prev);
        return found ? prev : "full";
      });
    }
  }, [tabs]);

  const closePreview = () => {
    setSelectedAsset(null);
    setCopyState("idle");
    setDownloadState("idle");
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
        {downloadState === "downloading" && <SpinnerIcon />}
        {downloadState === "success" && <CheckIcon />}
      </button>
      <button
        type="button"
        onClick={copySelectedAsset}
        disabled={copyState === "copying"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-outline-variant bg-surface-container-low text-on-surface-variant transition hover:text-on-surface disabled:opacity-50"
      >
        {copyState === "idle" && <CopyIcon />}
        {copyState === "copying" && <SpinnerIcon />}
        {copyState === "success" && <CheckIcon />}
        {copyState === "error" && (
          <svg className="h-4 w-4 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </button>
    </>
  ) : null;

  if (loading) {
    return <SiriusLoader locale={locale} label={t(locale, "supportCards.loading")} className="md3-surface min-h-72" />;
  }

  if (error || !card) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12" role={error ? "alert" : undefined}>
        <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">
          {t(locale, error ? "supportCards.loadErrorTitle" : "supportCards.detailNotFound")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">
          {t(locale, error ? "supportCards.loadErrorDescription" : "cards.detailNotFoundDescription")}
        </p>
        {error && (
          <button
            type="button"
            onClick={() => setReloadKey((value) => value + 1)}
            className="md3-state mt-6 rounded-full border border-outline-variant bg-primary px-6 py-3 text-label-large text-on-primary shadow-elevation-1"
          >
            {t(locale, "cards.retry")}
          </button>
        )}
      </div>
    );
  }

  const attribute = t(locale, `cards.attributes.${card.cardType}`);
  const rarity = t(locale, `cards.rarities.${card.rarity}`);
  const levelLimit = supportCardLevelLimit(growth, build.rank);
  const parameters = levelParameters(card, growth.levelCurve, build.level);
  const maxParameters = levelParameters(card, growth.levelCurve, maxBuild.level);
  const parameterScale = Math.max(maxParameters.performancePower, maxParameters.technicPower, maxParameters.visualPower);
  const isMaxBuild = build.level === maxBuild.level && build.rank === maxBuild.rank;
  const rankStep = growth.rankSteps.find((step) => step.rank === build.rank);
  const skillLevelFor = (skill: SkillViewModel) =>
    (skill.kind === "gekisou" ? rankStep?.gekisouSupportSkillLevel : rankStep?.supportSkillLevel) ?? maxSkillLevel(skill);
  const setRank = (rank: number) =>
    setBuild((current) => ({ rank, level: Math.min(current.level, supportCardLevelLimit(growth, rank)) }));
  const activeAsset = (assets.find((a) => a.id === activeTabId) ?? assets[0])!;

  return (
    <div className="space-y-8 w-full">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        {/* Left Column: Fixed / Sticky Asset Pane */}
        <aside className="lg:sticky lg:top-24 w-full flex flex-col pt-8">
          <div
            className="relative aspect-[4/3] w-full rounded-shape-lg border border-outline-variant bg-surface-container-low p-5 shadow-elevation-1"
          >
            {/* Magazine Spine Crease */}

            {/* Horizontal Bookmarks/Tabs on the Top Edge */}
            <div className="absolute bottom-full left-4 right-4 flex flex-wrap gap-1 pb-[1px] z-10">
              {topTabs.map((tab) => {
                const isActive = activeTabId === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className={`px-3 pt-1.5 pb-3 text-label-medium border border-b-0 border-outline-variant rounded-t-xl transition-all origin-bottom -mb-[6px] ${ isActive ? "bg-primary text-on-primary shadow-md z-20 -translate-y-[2px]" : "bg-surface-container text-on-surface hover:bg-secondary-container hover:-translate-y-[1px]" }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Book Pages */}
            <div className="relative h-full w-full flex flex-col justify-center">
              {activeTabId !== "info" ? (
                <div className="w-full flex items-center justify-center p-2">
                  {/* Polaroid Photo Frame */}
                  <button
                    type="button"
                    onClick={() => activeAsset && setSelectedAsset(activeAsset)}
                    className="group relative block w-full aspect-[16/9] overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-highest shadow-inner transition hover:scale-[1.01]"
                    aria-label={t(locale, "cards.assets.previewFull")}
                  >
                    {activeAsset && (
                      <div className={`h-full w-full ${activeAsset.transparent ? "md3-transparency-grid bg-surface-container-highest" : ""}`}>
                        <img
                          className={activeAsset.compact ? "max-h-full max-w-full object-contain mx-auto my-auto absolute inset-0 p-4" : "h-full w-full object-cover"}
                          src={activeAsset.url}
                          alt={activeAsset.label}
                        />
                      </div>
                    )}
                    {/* Zoom Indicator */}
                    <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10 flex items-center justify-center">
                      <svg className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" /></svg>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col justify-between">
                  {/* Diary handbook quote & card meta */}
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    {card.diaryText && (
                      <div className="relative rounded-shape-lg border border-solid border-outline-variant bg-secondary-container p-4 text-label-medium text-on-surface-variant shadow-inner">
                        <div className="absolute top-2 right-2 bg-surface-container border border-outline-variant px-1.5 py-0.5 text-label-medium text-primary rounded">
                          DIARY
                        </div>
                        <p className="mt-2 italic whitespace-pre-wrap">"{card.diaryText}"</p>
                      </div>
                    )}

                    <div className="rounded-shape-lg border border-solid border-outline-variant bg-surface-container p-4 space-y-3 shadow-inner">
                      <h4 className="font-[var(--md-ref-typeface-brand)] text-body-medium text-on-surface border-b border-outline-variant/60 pb-1.5">Notebook Log</h4>
                      <div className="space-y-2 text-label-small text-on-surface-variant">
                        <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                          <span>Rarity</span>
                          <span className="text-on-surface">{rarity}</span>
                        </div>
                        <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                          <span>Attribute</span>
                          <span className="text-on-surface">{attribute}</span>
                        </div>
                        <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                          <span>Band</span>
                          <span className="text-on-surface">{card.bandName}</span>
                        </div>
                        <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                          <span>Release</span>
                          <span className="text-on-surface">{formatMasterDay(card.startAt, locale, timeZone)}</span>
                        </div>
                        <div className="flex justify-between border-b border-outline-variant/20 pb-1">
                          <span>Card ID</span>
                          <span className="text-on-surface">#{card.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Asset ID</span>
                          <span className="text-on-surface">#{card.assetId}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Horizontal Bookmarks/Tabs on the Bottom Edge */}
            <div className="absolute top-full left-4 right-4 flex flex-wrap gap-1 pt-[1px] z-10">
              {bottomTabs.map((tab) => {
                const isActive = activeTabId === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTabId(tab.id)}
                    className={`px-3 pt-3 pb-1.5 text-label-medium border border-t-0 border-outline-variant rounded-b-xl transition-all origin-top -mt-[6px] ${ isActive ? "bg-primary text-on-primary shadow-md z-20 translate-y-[2px]" : "bg-surface-container text-on-surface hover:bg-secondary-container hover:translate-y-[1px]" }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Column: Other Content */}
        <section className="flex-1 min-w-0 space-y-6">
          {/* Card Info Card */}
          <div className="md3-surface overflow-hidden">
            {/* Title Section (Header Banner) */}
            <div className="border-b border-outline-variant p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <img
                      className="h-6 w-auto object-contain block dark:hidden"
                      src={assetUrl(getBandLogoUrl(card.bandId, locale))}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <img
                      className="h-6 w-auto object-contain hidden dark:block"
                      src={assetUrl(getBandLogoWhiteUrl(card.bandId, locale))}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span className="font-[var(--md-ref-typeface-mono)] text-body-medium text-primary">{card.bandName}</span>
                  </div>
                  <h2 className="mt-1 font-[var(--md-ref-typeface-brand)] text-headline-medium text-on-surface sm:text-headline-large">{card.title}</h2>
                  <p className="mt-3 text-body-large text-on-surface-variant">{card.name}</p>
                </div>
                {getSupportRarityIconUrl(card.rarity)
                  ? <img className="h-12 w-auto" src={assetUrl(getSupportRarityIconUrl(card.rarity))} alt={rarity} />
                  : <span className="text-label-large text-primary">{rarity}</span>}
              </div>
            </div>

            {/* Body Section (Detail Rows List) */}
            <div className="p-6 sm:p-8 bg-surface-container-low">
              <div className="divide-y divide-dashed divide-outline-variant/60">
                <DetailRow label={t(locale, "cards.detailRarity")} value={rarity} />
                <DetailRow label={t(locale, "cards.detailAttribute")} value={<span className="inline-flex items-center gap-2"><img className="h-5 w-5" src={assetUrl(getSupportCardTypeIconUrl(card.cardType))} alt="" aria-hidden="true" />{attribute}</span>} />
                <DetailRow
                  label={t(locale, "cards.detailBand")}
                  value={
                    <span className="inline-flex items-center gap-2">
                      <img
                        className="h-5 w-5 object-contain"
                        src={assetUrl(getBandSmallIconUrl(card.bandId))}
                        alt=""
                        aria-hidden="true"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                      {card.bandName}
                    </span>
                  }
                />
                <DetailRow label={t(locale, "cards.detailReleasedAt")} value={formatMasterDay(card.startAt, locale, timeZone)} />
                <DetailRow label={t(locale, "cards.detailCardId")} value={`#${card.id}`} />
                <DetailRow label={t(locale, "cards.detailAssetId")} value={`#${card.assetId}`} />

                {/* Featured Characters Row */}
                <DetailRow
                  label={t(locale, "nav.items.characters")}
                  value={
                    <div className="flex flex-wrap gap-2 justify-end">
                      {card.characters.map((char) => (
                        <img
                          key={char.id}
                          className="h-7 w-7 rounded-full object-cover bg-surface-container-highest border border-outline-variant transition-transform hover:scale-105"
                          src={assetUrl(getCharacterFaceIconUrl(char.id))}
                          alt={char.name}
                          title={char.name}
                        />
                      ))}
                    </div>
                  }
                />
              </div>
            </div>
          </div>

          {/* Parameters Card */}
          <div className="md3-surface overflow-hidden">
            {/* Title Section */}
            <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
              <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                {t(locale, "cards.parametersTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 space-y-5">
              {growth.levelCurve.length > 0 && (
                <div className="space-y-4 border-b border-solid border-outline-variant/60 pb-5">
                  <LevelControl locale={locale} level={build.level} limit={levelLimit} onChange={(level) => setBuild((current) => ({ ...current, level }))} />
                  {growth.rankSteps.length > 1 && (
                    <StepControl
                      label={t(locale, "supportCards.growth.limitBreak")}
                      value={build.rank}
                      options={growth.rankSteps.map((step) => step.rank)}
                      onChange={setRank}
                    />
                  )}
                </div>
              )}

              {/* Highlighted Total Parameter Row */}
              <div className="flex items-center justify-between border-b border-solid border-outline-variant/60 pb-4">
                <span className="text-label-large text-on-surface-variant">
                  {t(locale, isMaxBuild ? "cards.detailPower" : "cards.growth.power")}
                </span>
                <span className="font-mono text-headline-small text-primary">
                  {parameters.totalPower.toLocaleString(locale)}
                </span>
              </div>

              <div className="space-y-4">
                <ParameterBar label={t(locale, "cards.parameters.performance")} value={parameters.performancePower} max={parameterScale} color="var(--md-sys-color-primary)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.technique")} value={parameters.technicPower} max={parameterScale} color="var(--md-sys-color-category2)" locale={locale} />
                <ParameterBar label={t(locale, "cards.parameters.visual")} value={parameters.visualPower} max={parameterScale} color="var(--md-sys-color-success)" locale={locale} />
              </div>
            </div>
          </div>

          {/* Skills Card */}
          <div className="md3-surface overflow-hidden">
            {/* Title Section */}
            <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
              <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                {t(locale, "supportCards.skillsTitle")}
              </h3>
            </div>
            {/* Body Section */}
            <div className="p-6 sm:p-8 flex flex-col gap-4">
              {data.skills.length > 0 && growth.rankSteps.length > 0 ? (
                <p className="text-body-small text-on-surface-variant">{t(locale, "supportCards.growth.skillLevelHint")}</p>
              ) : null}
              {data.skills.length > 0 ? (
                data.skills.map((skill, index) => (
                  <SkillCard key={index} skill={skill} level={skillLevelFor(skill)} locale={locale} />
                ))
              ) : (
                <p className="text-body-medium text-on-surface-variant py-4 text-center">
                  暂无支援技能数据 {/* i18n-allow-hardcoded */}
                </p>
              )}
            </div>
          </div>

          {/* Card Diary Section */}
          {card.diaryText && (
            <div className="md3-surface overflow-hidden">
              <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
                <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                  {t(locale, "supportCards.diaryTitle")}
                </h3>
              </div>
              <div className="p-6 sm:p-8">
                <div className="whitespace-pre-wrap rounded-shape-lg border border-outline-variant bg-surface-container p-5 text-body-medium leading-8 text-on-surface font-sans italic shadow-elevation-1">
                  {card.diaryText}
                </div>
              </div>
            </div>
          )}

          {materials && materials.groups.length > 0 && <CardMaterialsPanel locale={locale} groups={materials.groups} />}

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("support-cards"), locale)} className="md3-state inline-flex rounded-full border border-outline-variant bg-surface-container-low px-6 py-3 text-label-large text-on-surface shadow-elevation-1">
              {t(locale, "supportCards.backToList")}
            </a>
          </div>
        </section>
      </div>

      <Modal
        isOpen={selectedAsset !== null}
        onClose={closePreview}
        title={selectedAsset?.label ?? ""}
        closeLabel={t(locale, "actions.close")}
        size={selectedAsset?.id === "sprite" ? "sm" : "md"}
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-body-medium">
      <span className="font-semibold text-on-surface-variant">{label}</span>
      <span className="font-semibold text-on-surface">{value}</span>
    </div>
  );
}

function ParameterBar({
  label,
  value,
  max,
  color,
  locale,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  locale: AppLocale;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-label-large">
        <span className="text-on-surface-variant">{label}</span>
        <span className="font-mono text-on-surface">{value.toLocaleString(locale)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SkillCard({ skill, level, locale }: { skill: SkillViewModel; level: number; locale: AppLocale }) {
  const isGekisou = skill.kind === "gekisou";
  const current = pickSkillLevel(skill, level);
  const assetUrl = useAssetUrl();
  return (
    <article className="rounded-shape-lg border border-outline-variant bg-surface-container-high p-5 shadow-elevation-1">
      <div className="flex items-start gap-4">
        {skill.iconUrl ? (
          <img
            className="h-14 w-14 shrink-0 rounded-shape-lg border border-outline-variant bg-surface-container-low object-contain p-1"
            src={assetUrl(skill.iconUrl)}
            alt=""
            aria-hidden="true"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-label-medium text-primary">
            {t(locale, isGekisou ? "supportCards.skillKinds.gekisouSupport" : "supportCards.skillKinds.support")}
          </p>
          <h3 className="mt-1 text-title-medium leading-6 text-on-surface">{skill.name}</h3>
          <p className="mt-1 text-body-small text-on-surface-variant">
            {t(locale, "cards.skillMeta", { level: current.level, id: skill.id })}
          </p>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-line rounded-shape-lg border border-solid border-outline-variant bg-surface-container-low p-4 text-body-medium leading-7 text-on-surface">
        {current.description || fallbackSkillDescription(current, locale)}
      </p>
    </article>
  );
}

function fallbackSkillDescription(skill: SkillLevelViewModel, locale: AppLocale): string {
  const values = skill.effects
    .map((effect) => {
      const value =
        effect.effectType < 10000
          ? `${(effect.value / 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`
          : effect.value.toLocaleString(locale);
      return effect.duration === undefined ? value : `${effect.duration.toFixed(1)}s · ${value}`;
    })
    .join(" / ");
  return t(locale, "cards.skillFallback", { values });
}


function CopyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-on-success-container"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <SiriusIcon />
  );
}

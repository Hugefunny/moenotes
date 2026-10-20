import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { roomCheckConfig } from "@/config/room-check";
import type { GameServer } from "@/config/servers";
import { withMd3 } from "@/components/md3/Md3Provider";
import { createRoomApi, type RoomReply } from "@/lib/room-check/client";
import { changedPlayers, refreshIn } from "@/lib/room-check/summary";
import { loadSavedRooms, saveRooms } from "@/lib/room-check/store";
import type { RoomEntry, RoomSnapshot } from "@/lib/room-check/types";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { useServerAssetUrl } from "@/lib/servers/use-content-server";
import type { LiveState } from "./FreshnessBar";
import RoomCodeForm from "./RoomCodeForm";
import RoomDetail from "./RoomDetail";
import RoomList, { entryKey } from "./RoomList";
import RoomStateCard, { ComingSoonCard } from "./RoomStateCard";
import type { RoomSong } from "./songs";

interface Props {
  locale: AppLocale;
  songs: RoomSong[];
  cards: DeckCardLookup;
}

/** How long a changed player's line stays highlighted after an update. */
const CHANGE_FLASH_MS = 1_800;

const blank = (code: string, region: GameServer, status: RoomEntry["status"]): RoomEntry => ({ code, region, status, last: null, error: null, errorAt: null });

/** The page clock, ticking every second while the page is visible. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      setNow(Date.now());
      if (document.visibilityState === "visible") timer = window.setInterval(() => setNow(Date.now()), 1_000);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);
  return now;
}

/**
 * Room Check: a list of rooms looked up by code and the selected room's players with their teams. Rooms are read one
 * at a time; a read shows its age, and the room can be followed live.
 */
function RoomCheckTool({ locale, songs, cards }: Props) {
  const api = useMemo(() => createRoomApi({
    memberIds: Object.keys(cards.member).map(Number), supportIds: Object.keys(cards.support).map(Number), musicIds: songs.map((song) => song.id),
  }), [cards, songs]);
  const songMap = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  const [region, setRegion] = useState<GameServer>(roomCheckConfig.servers[0]!);
  const [rooms, setRooms] = useState<RoomEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [live, setLive] = useState<LiveState>({ status: "off" });
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  const controllers = useRef(new Map<string, AbortController>());
  const now = useNow();
  const current = rooms.find((entry) => entryKey(entry) === selected) ?? null;
  // Card art comes from the catalog of the room's server.
  const assetUrl = useServerAssetUrl(current?.region ?? region);

  const update = useCallback((key: string, change: (entry: RoomEntry) => RoomEntry) => {
    setRooms((current) => current.map((entry) => (entryKey(entry) === key ? change(entry) : entry)));
  }, []);

  // The list of an earlier visit comes back unread; the first room is read once shown.
  useEffect(() => {
    const saved = loadSavedRooms();
    setRooms(saved.map(({ code, region: server }, index) => blank(code, server, index === 0 ? "queued" : "idle")));
    setSelected(saved[0] ? entryKey(saved[0]) : null);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveRooms(rooms);
  }, [rooms, restored]);

  const apply = useCallback((key: string, reply: RoomReply) => {
    const receivedAt = Date.now();
    update(key, (entry) => {
      if (reply.ok) return { ...entry, status: "ready", last: { snapshot: reply.snapshot, receivedAt }, error: null, errorAt: null };
      // A refused read that comes with the shared copy still shows the room.
      if (reply.error.code === "cooldown" && reply.error.snapshot) {
        return { ...entry, status: "ready", last: { snapshot: reply.error.snapshot, receivedAt }, error: null, errorAt: null };
      }
      return { ...entry, status: "error", error: reply.error, errorAt: receivedAt };
    });
  }, [update]);

  const read = useCallback((entry: RoomEntry) => {
    const key = entryKey(entry);
    const controller = new AbortController();
    controllers.current.set(key, controller);
    update(key, (current) => ({ ...current, status: "loading" }));
    api.read(entry.code, entry.region, controller.signal)
      .then((reply) => apply(key, reply))
      .catch(() => {
        if (!controller.signal.aborted) apply(key, { ok: false, error: { code: "network", retryAfterMs: null, snapshot: null } });
      })
      .finally(() => controllers.current.delete(key));
  }, [api, apply, update]);

  // One read at a time, in list order.
  useEffect(() => {
    if (rooms.some((entry) => entry.status === "loading")) return;
    const next = rooms.find((entry) => entry.status === "queued");
    if (next) read(next);
  }, [rooms, read]);

  useEffect(() => () => controllers.current.forEach((controller) => controller.abort()), []);

  const add = (codes: string[]) => {
    const known = new Set(rooms.map(entryKey));
    const fresh = codes.filter((code) => !known.has(entryKey({ code, region })));
    const first = codes[0];
    if (fresh.length) {
      const next = [...fresh.map((code) => blank(code, region, "queued")), ...rooms];
      for (const dropped of next.slice(roomCheckConfig.maxRooms)) controllers.current.get(entryKey(dropped))?.abort();
      setRooms(next.slice(0, roomCheckConfig.maxRooms));
    }
    if (first) select(entryKey({ code: first, region }));
    return fresh.length;
  };

  const select = (key: string) => {
    if (key !== selected) {
      setLive({ status: "off" });
      setChanged(new Set());
    }
    setSelected(key);
    update(key, (entry) => (entry.status === "idle" ? { ...entry, status: "queued" } : entry));
  };

  const remove = (key: string) => {
    controllers.current.get(key)?.abort();
    const next = rooms.filter((entry) => entryKey(entry) !== key);
    const first = next[0];
    setRooms(key === selected && first?.status === "idle" ? next.map((entry) => (entry === first ? { ...entry, status: "queued" } : entry)) : next);
    if (key === selected) {
      setLive({ status: "off" });
      setSelected(first ? entryKey(first) : null);
    }
  };

  const clear = () => {
    controllers.current.forEach((controller) => controller.abort());
    setLive({ status: "off" });
    setRooms([]);
    setSelected(null);
  };

  const refresh = () => {
    if (!current || current.status === "loading" || current.status === "queued") return;
    if (current.last && refreshIn(current.last.snapshot, current.last.receivedAt, Date.now()) > 0) return;
    update(entryKey(current), (entry) => ({ ...entry, status: "queued" }));
  };

  // Following the selected room: each update replaces its read and highlights the players that changed.
  const liveKey = live.status === "on" && current ? entryKey(current) : null;
  useEffect(() => {
    if (!liveKey || !current) return;
    let previous: RoomSnapshot | null = current.last?.snapshot ?? null;
    let flash: number | undefined;
    const stop = api.watch(current.code, current.region, {
      onSnapshot: (snapshot) => {
        const moved = changedPlayers(previous, snapshot);
        previous = snapshot;
        apply(liveKey, { ok: true, snapshot });
        if (moved.size) {
          setChanged(moved);
          window.clearTimeout(flash);
          flash = window.setTimeout(() => setChanged(new Set()), CHANGE_FLASH_MS);
        }
      },
      onStop: (reason) => setLive({ status: "stopped", reason }),
    });
    return () => {
      stop();
      window.clearTimeout(flash);
    };
    // The watch follows the room key only; its reads arrive through `apply`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, api, apply]);

  return (
    <div className="rc-root">
      <RoomCodeForm locale={locale} region={region} onRegion={setRegion} onAdd={add} />
      <div className="rc-body" data-empty={rooms.length === 0 || undefined}>
        <RoomList locale={locale} rooms={rooms} selected={selected} songs={songMap} now={now} onSelect={select} onRemove={remove} onClear={clear} />
        <div className="rc-main">
          {current
            ? <RoomDetail locale={locale} entry={current} songs={songMap} cards={cards} assetUrl={assetUrl} now={now} live={live} changed={changed}
              onRefresh={refresh} onLive={(on) => setLive(on ? { status: "on" } : { status: "off" })} />
            : <RoomStateCard locale={locale} kind="intro" now={now} />}
        </div>
      </div>
      <ComingSoonCard locale={locale} />
    </div>
  );
}

export default withMd3(RoomCheckTool);

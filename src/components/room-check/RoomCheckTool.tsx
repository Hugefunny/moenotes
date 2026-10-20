import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { roomCheckConfig } from "@/config/room-check";
import type { GameServer } from "@/config/servers";
import { withMd3 } from "@/components/md3/Md3Provider";
import { createRoomApi, type CreateReply, type RoomReply } from "@/lib/room-check/client";
import { changedPlayers, refreshIn } from "@/lib/room-check/summary";
import { loadSavedRooms, saveRooms } from "@/lib/room-check/store";
import type { CreatedRoom, RoomEntry, RoomError, RoomSnapshot, WatchStop } from "@/lib/room-check/types";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { useServerAssetUrl } from "@/lib/servers/use-content-server";
import AtFourNotice, { type AtFourState } from "./AtFourNotice";
import CreateRoomCard from "./CreateRoomCard";
import type { LiveState } from "./FreshnessBar";
import RoomCodeForm from "./RoomCodeForm";
import RoomDetail from "./RoomDetail";
import RoomList, { entryKey } from "./RoomList";
import RoomStateCard from "./RoomStateCard";
import type { RoomSong } from "./songs";

interface Props {
  locale: AppLocale;
  songs: RoomSong[];
  cards: DeckCardLookup;
}

/** How long a changed player's line stays highlighted after an update. */
const CHANGE_FLASH_MS = 1_800;

const blank = (code: string, region: GameServer, status: RoomEntry["status"], created = false, watchId: string | null = null): RoomEntry =>
  ({ code, region, status, last: null, error: null, errorAt: null, watchId, created });

/** The four-player offer of a room this page opened. */
interface AtFour extends AtFourState {
  /** The room the offer belongs to. */
  key: string;
}

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
 *
 * A room can also be opened from the page. The service hands back the watch of the observer it keeps in that room, so
 * the room is followed through that watch, which also says when four players are in and the observer should leave.
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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<RoomError | null>(null);
  const [createErrorAt, setCreateErrorAt] = useState<number | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [atFour, setAtFour] = useState<AtFour | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const createController = useRef<AbortController | null>(null);
  const now = useNow();
  const current = rooms.find((entry) => entryKey(entry) === selected) ?? null;
  // Card art comes from the catalog of the room's server.
  const assetUrl = useServerAssetUrl(current?.region ?? region);

  const update = useCallback((key: string, change: (entry: RoomEntry) => RoomEntry) => {
    setRooms((list) => list.map((entry) => (entryKey(entry) === key ? change(entry) : entry)));
  }, []);

  // The list of an earlier visit comes back unread; the first room is read once shown. A room this browser opened is
  // followed again through its watch, which falls back to a plain read when it has ended.
  useEffect(() => {
    const saved = loadSavedRooms();
    const first = saved[0];
    // A watch still holding the first room fills it from the stream, so it is not queued for a read.
    const following = first?.created === true && first.watchId !== null;
    const restoredRooms = saved.map(({ code, region: server, watchId, created }, index) => {
      const status: RoomEntry["status"] = index === 0 ? (following ? "idle" : "queued") : "idle";
      return blank(code, server, status, created, watchId);
    });
    setRooms(restoredRooms);
    setSelected(first ? entryKey(first) : null);
    setLive(following ? { status: "on" } : { status: "off" });
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
    update(key, (item) => ({ ...item, status: "loading" }));
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

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    createController.current?.abort();
  }, []);

  /** The watch of a room this page opened has ended: the room stays in the list, read like any other room. */
  const forgetWatch = useCallback((key: string, reason: WatchStop) => {
    update(key, (entry) => (entry.watchId === null ? entry : { ...entry, watchId: null, status: "queued" }));
    setAtFour((offer) => (offer && offer.key === key ? null : offer));
    setLive({ status: "stopped", reason });
    setOpened(null);
  }, [update]);

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
      setAtFour(null);
    }
    setSelected(key);
    const entry = rooms.find((item) => entryKey(item) === key);
    if (!entry || entry.status !== "idle") return;
    // A room this browser opened is followed again through its watch; a watch that has ended falls back to a read.
    if (entry.created && entry.watchId) {
      setLive({ status: "on" });
      return;
    }
    update(key, (item) => ({ ...item, status: "queued" }));
  };

  const remove = (key: string) => {
    controllers.current.get(key)?.abort();
    // A room this page opened is abandoned with its watch, so the observer leaves instead of holding its seat.
    const removed = rooms.find((entry) => entryKey(entry) === key);
    if (removed?.created && removed.watchId) api.stopCreated({ code: removed.code, region: removed.region, watchId: removed.watchId });
    const next = rooms.filter((entry) => entryKey(entry) !== key);
    const first = next[0];
    setRooms(key === selected && first?.status === "idle" ? next.map((entry) => (entry === first ? { ...entry, status: "queued" } : entry)) : next);
    if (key === selected) {
      setLive({ status: "off" });
      setAtFour(null);
      setSelected(first ? entryKey(first) : null);
    }
  };

  const clear = () => {
    controllers.current.forEach((controller) => controller.abort());
    for (const entry of rooms) {
      if (entry.created && entry.watchId) api.stopCreated({ code: entry.code, region: entry.region, watchId: entry.watchId });
    }
    setLive({ status: "off" });
    setAtFour(null);
    setRooms([]);
    setSelected(null);
  };

  const refresh = () => {
    if (!current || current.status === "loading" || current.status === "queued") return;
    if (current.last && refreshIn(current.last.snapshot, current.last.receivedAt, Date.now()) > 0) return;
    update(entryKey(current), (entry) => ({ ...entry, status: "queued" }));
  };

  /** Opens a room and follows it at once, through the watch the service hands back. */
  const create = (code: string | null) => {
    if (creating) return;
    createController.current?.abort();
    const controller = new AbortController();
    createController.current = controller;
    setCreating(true);
    setCreateError(null);
    setCreateErrorAt(null);
    setOpened(null);
    const failed = (error: RoomError) => {
      setCreateError(error);
      setCreateErrorAt(Date.now());
    };
    api.create(region, code, controller.signal)
      .then((reply: CreateReply) => {
        if (controller.signal.aborted) return;
        if (!reply.ok) {
          failed(reply.error);
          return;
        }
        const { room } = reply;
        const key = entryKey(room);
        const entry = blank(room.code, room.region, "loading", true, room.watchId);
        setRooms((list) => [entry, ...list.filter((item) => entryKey(item) !== key)].slice(0, roomCheckConfig.maxRooms));
        setRegion(room.region);
        setSelected(key);
        setLive({ status: "on" });
        setChanged(new Set());
        setAtFour(null);
        setOpened(room.code);
      })
      .catch(() => {
        if (!controller.signal.aborted) failed({ code: "network", retryAfterMs: null, snapshot: null });
      })
      .finally(() => {
        createController.current = null;
        setCreating(false);
      });
  };

  /** Asks the observer of a room this page opened to leave, so the fifth player can join. */
  const kick = (room: CreatedRoom, key: string) => {
    setAtFour((offer) => (offer && offer.key === key ? { ...offer, kicking: true, failed: false } : offer));
    const failed = () => setAtFour((offer) => (offer && offer.key === key ? { ...offer, kicking: false, failed: true } : offer));
    api.kick(room).then((reply) => {
      // A room whose observer is already gone is read like any other from now on.
      if (reply.ok || reply.error.code === "not_bot_room") forgetWatch(key, "kicked");
      else failed();
    }, failed);
  };

  // Following the selected room while its switch is on: each update replaces its read and highlights the players that
  // changed. A room this page opened is followed through its watch, which also says when four players are in.
  const followKey = current && live.status === "on" ? `${entryKey(current)}:${current.watchId ?? ""}` : null;
  useEffect(() => {
    if (!followKey || !current) return;
    const key = entryKey(current);
    const own: CreatedRoom | null = current.created && current.watchId ? { code: current.code, region: current.region, watchId: current.watchId } : null;
    let previous: RoomSnapshot | null = current.last?.snapshot ?? null;
    let flash: number | undefined;
    const onSnapshot = (snapshot: RoomSnapshot) => {
      const moved = changedPlayers(previous, snapshot);
      previous = snapshot;
      apply(key, { ok: true, snapshot });
      // A room that dropped below four again no longer needs the observer to leave.
      if (snapshot.room.humans < 4) setAtFour((state) => (state && state.key === key ? null : state));
      if (moved.size) {
        setChanged(moved);
        window.clearTimeout(flash);
        flash = window.setTimeout(() => setChanged(new Set()), CHANGE_FLASH_MS);
      }
    };
    const onStop = (reason: WatchStop) => {
      // A room this page opened stays in the list: its watch ended, so it is read like any other room.
      if (own) forgetWatch(key, reason);
      else setLive({ status: "stopped", reason });
    };
    const offer = (room: CreatedRoom) => (snapshot: RoomSnapshot | null) => {
      if (snapshot) onSnapshot(snapshot);
      // The event itself is the signal that four players are in, so the offer does not wait for a readable read.
      // An offer already dismissed stays dismissed; a failed attempt is cleared for the next one.
      setAtFour((state) => (state && state.key === key ? { ...state, failed: false } : {
        key,
        prompt: true,
        kicking: false,
        failed: false,
        onKick: () => kick(room, key),
        onKeep: () => setAtFour((currentOffer) => (currentOffer && currentOffer.key === key ? { ...currentOffer, prompt: false } : currentOffer)),
      }));
    };
    const stop = own
      ? api.watchCreated(own, { onSnapshot, onStop, onAtFour: offer(own) })
      : api.watch(current.code, current.region, { onSnapshot, onStop });
    return () => {
      stop();
      window.clearTimeout(flash);
    };
    // The watch follows the room and its watch id only; its reads arrive through `apply`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followKey, api, apply]);

  const atFourState = atFour && current && atFour.key === entryKey(current) && current.watchId !== null ? atFour : null;

  return (
    <div className="rc-root">
      <RoomCodeForm locale={locale} region={region} onRegion={setRegion} onAdd={add} />
      <div className="rc-body" data-empty={rooms.length === 0 || undefined}>
        <RoomList locale={locale} rooms={rooms} selected={selected} songs={songMap} now={now} onSelect={select} onRemove={remove} onClear={clear} />
        <div className="rc-main">
          {current
            ? <RoomDetail locale={locale} entry={current} songs={songMap} cards={cards} assetUrl={assetUrl} now={now} live={live} changed={changed}
              banner={atFourState ? <AtFourNotice locale={locale} state={atFourState} /> : null}
              onRefresh={refresh} onLive={(on) => setLive(on ? { status: "on" } : { status: "off" })} />
            : <RoomStateCard locale={locale} kind="intro" now={now} />}
        </div>
      </div>
      <CreateRoomCard locale={locale} region={region} onRegion={setRegion} busy={creating} error={createError} errorAt={createErrorAt}
        opened={opened} now={now} onCreate={create} />
    </div>
  );
}

export default withMd3(RoomCheckTool);

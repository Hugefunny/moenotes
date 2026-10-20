import { useState, type ClipboardEvent, type FormEvent } from "react";
import type { AppLocale } from "@/config/locales";
import { roomCheckConfig } from "@/config/room-check";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { extractRoomCodes } from "@/lib/room-check/parse";

interface Props {
  locale: AppLocale;
  region: GameServer;
  onRegion: (region: GameServer) => void;
  /** Adds the codes to the list and reads them; returns how many were new. */
  onAdd: (codes: string[]) => number;
}

/**
 * One field for a room code. Pasting a message adds every room code in it at once, so a list of rooms shared in a
 * chat can be checked together.
 */
export default function RoomCodeForm({ locale, region, onRegion, onAdd }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `roomCheck.form.${key}`, values);
  const [value, setValue] = useState("");
  const [note, setNote] = useState<{ kind: "added" | "invalid" | "known"; n: number } | null>(null);

  const add = (codes: string[]) => {
    if (!codes.length) {
      setNote({ kind: "invalid", n: 0 });
      return;
    }
    const added = onAdd(codes);
    setNote(added > 0 ? { kind: "added", n: added } : { kind: "known", n: codes.length });
    setValue("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    add(extractRoomCodes(value));
  };
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    // A bare code goes into the field as typed; a message with codes in it is read at once.
    if (/^\s*\d{7}\s*$/.test(text)) return;
    const codes = extractRoomCodes(text);
    if (!codes.length) return;
    event.preventDefault();
    add(codes);
  };

  return (
    <form className="rc-form" onSubmit={submit} noValidate>
      <label className="rc-form-field">
        <span className="rc-form-label">{tr("label")}</span>
        <span className="rc-form-input">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" /></svg>
          <input value={value} onChange={(event) => { setValue(event.target.value); setNote(null); }} onPaste={paste}
            inputMode="numeric" autoComplete="off" enterKeyHint="search" spellCheck={false}
            placeholder={tr("placeholder")} aria-describedby="rc-form-hint" />
        </span>
      </label>
      <div className="rc-form-actions">
        <GameServerSwitch locale={locale} value={region} onChange={onRegion} servers={roomCheckConfig.servers} />
        <button type="submit" className="md3-button md3-button--filled">{tr("submit")}</button>
      </div>
      <p id="rc-form-hint" className="rc-form-hint" data-kind={note?.kind} role={note ? "status" : undefined}>
        {note ? tr(`notes.${note.kind}`, { n: note.n }) : tr("hint")}
      </p>
    </form>
  );
}

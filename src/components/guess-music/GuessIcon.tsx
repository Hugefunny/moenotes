import type { ReactNode } from "react";

const paths = {
  play: <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />,
  replay: <><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></>,
  playing: <path d="M5 10v4M9 6v12M13 9v6M17 4v16M21 10v4"/>,
  warning: <><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/></>,
  heart: <path d="M12 20S4 15.6 4 9.2C4 5 9.2 3.3 12 7c2.8-3.7 8-2 8 2.2C20 15.6 12 20 12 20Z" fill="currentColor" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  flag: <><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></>,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></>,
  next: <path d="M5 12h14M13 6l6 6-6 6" />,
  external: <><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v6H4V6h6"/></>,
  tune: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7"/></>,
  practice: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></>,
  login: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M4 12h11M11 8l4 4-4 4"/></>,
  game: <><rect x="3" y="7.5" width="18" height="10" rx="5"/><path d="M8 10.5v4M6 12.5h4M15.5 11.5h.01M17.5 13.5h.01"/></>,
} satisfies Record<string, ReactNode>;

export type GuessIconName = keyof typeof paths;

/** A line icon of the guess-the-song game, in the stroke style of the route glyphs. */
export default function GuessIcon({ name, size = 20, className }: { name: GuessIconName; size?: number; className?: string | undefined }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

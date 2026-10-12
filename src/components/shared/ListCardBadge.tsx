interface Props {
  label: string;
  /** Tailwind position classes; top right keeps clear of the attribute icon on card artwork. */
  position?: string;
}

/** Overlay tag on list-card artwork. */
export default function ListCardBadge({ label, position = "right-2 top-2" }: Props) {
  return (
    <span className={`pointer-events-none absolute z-10 rounded-shape-sm bg-tertiary px-2 py-0.5 text-label-small text-on-tertiary ${position}`}>
      {label}
    </span>
  );
}

import type { ReactNode } from "react";

interface Props {
  id?: string;
  title: string;
  /** Right-aligned controls such as a "view all" link or a segmented toggle. */
  children?: ReactNode;
}

/** Section title (M3 title-large), with optional trailing controls. */
export default function SectionHeading({ id, title, children }: Props) {
  return (
    <div className="md3-section-heading">
      <h2 id={id}>{title}</h2>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

interface LinkProps {
  href: string;
  label: string;
}

export function SectionLink({ href, label }: LinkProps) {
  return (
    <a
      href={href}
      className="md3-button md3-button--text"
    >
      {label}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
    </a>
  );
}

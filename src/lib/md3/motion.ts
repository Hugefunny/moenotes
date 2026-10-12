/**
 * Material 3 motion for framer-motion / JS-driven transitions: the M3 easing curves and durations
 * (src/styles/md3/tokens.css), with reduced motion honoured. CSS transitions use the `--md-sys-motion-*` tokens
 * directly; MUI components take theirs from the theme (src/lib/md3/mui-theme.ts).
 */
import { useMemo } from "react";
import { useReducedMotion, type Transition, type Variants } from "framer-motion";

export const MD3_EASING = {
  standard: [0.2, 0, 0, 1],
  standardDecelerate: [0, 0, 0, 1],
  standardAccelerate: [0.3, 0, 1, 1],
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1],
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15],
} as const;

/** Durations in seconds (framer-motion units). */
export const MD3_DURATION = {
  short2: 0.1,
  short4: 0.2,
  medium2: 0.3,
  medium4: 0.4,
  long2: 0.5,
} as const;

export function useMd3Motion() {
  const reducedMotion = Boolean(useReducedMotion());
  return useMemo(() => {
    const none: Transition = { duration: 0 };
    /** Small state changes (selection, expand chevrons). */
    const standard: Transition = reducedMotion ? none : { duration: MD3_DURATION.short4, ease: MD3_EASING.standard };
    /** Elements entering the screen (dialogs, sheets, menus). */
    const enter: Transition = reducedMotion ? { duration: MD3_DURATION.short2 } : { duration: MD3_DURATION.medium4, ease: MD3_EASING.emphasizedDecelerate };
    /** Elements leaving the screen. */
    const exit: Transition = reducedMotion ? { duration: MD3_DURATION.short2 } : { duration: MD3_DURATION.short4, ease: MD3_EASING.emphasizedAccelerate };
    /** List items fading in one after another. */
    const listContainer: Variants = reducedMotion ? {} : { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
    const listItem: Variants = reducedMotion ? {} : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: enter } };
    return { reducedMotion, standard, enter, exit, listContainer, listItem };
  }, [reducedMotion]);
}

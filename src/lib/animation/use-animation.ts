import { useMemo } from "react";
import { useReducedMotion, type Transition, type Variants } from "framer-motion";
import { MD3_DURATION, MD3_EASING } from "@/lib/md3/motion";

/**
 * Legacy motion API, now Material 3 underneath: M3 easing and durations, no hover lift or press scale (M3 shows
 * interaction with state layers, see `.md3-state` and the MUI theme). Kept until the remaining callers move to
 * `useMd3Motion` (src/lib/md3/motion.ts).
 */
export function useSpringAnimation() {
  const reducedMotion = useReducedMotion();
  return useMemo(() => {
    const springTransition: Transition = { duration: MD3_DURATION.short4, ease: MD3_EASING.standard };
    const modalTransition: Transition = { duration: MD3_DURATION.medium2, ease: MD3_EASING.emphasizedDecelerate };

    const staggerContainer: Variants = {
      hidden: {},
      show: { transition: { staggerChildren: 0.03 } },
    };
    const staggerItem: Variants = {
      hidden: { opacity: 0, y: 8 },
      show: { opacity: 1, y: 0, transition: { duration: MD3_DURATION.medium4, ease: MD3_EASING.emphasizedDecelerate } },
    };

    return {
      isDisabled: Boolean(reducedMotion),
      springTransition: reducedMotion ? { duration: 0 } : springTransition,
      modalTransition: reducedMotion ? { duration: 0 } : modalTransition,
      floatHoverProps: {},
      floatTapProps: {},
      stampHoverProps: {},
      stampTapProps: {},
      staggerContainer: reducedMotion ? {} : staggerContainer,
      staggerItem: reducedMotion ? {} : staggerItem,
    };
  }, [reducedMotion]);
}

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpringAnimation } from "@/lib/animation/use-animation";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  // Circular button → stamp animation (shadow press effect)
  const { springTransition, stampHoverProps, stampTapProps } = useSpringAnimation();

  useEffect(() => {
    const MAX_THRESHOLD = 400;
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // Show when scrolled past 400px, or 30% of scrollable range (whichever is smaller)
      // Keep visible while a smooth scroll is in progress
      setVisible(scrollable > 0 && (scrolling || window.scrollY > Math.min(MAX_THRESHOLD, scrollable * 0.3)));
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrolling]);

  const scrollToTop = () => {
    if (scrolling) return;
    setScrolling(true);
    const start = window.scrollY;
    const duration = Math.min(1200, Math.max(400, start * 0.8)); // adaptive duration
    let startTime: number | null = null;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      window.scrollTo(0, start * (1 - easeOutCubic(progress)));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setScrolling(false);
      }
    };
    requestAnimationFrame(step);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={springTransition}
          {...stampHoverProps}
          {...stampTapProps}
          onClick={scrollToTop}
          data-scroll-to-top=""
          className="mn-scroll-top md3-state fixed bottom-6 right-6 z-30 grid h-14 w-14 place-items-center rounded-shape-lg bg-primary-container text-on-primary-container shadow-elevation-3 transition-shadow hover:shadow-elevation-4"
          aria-label="Scroll to top"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

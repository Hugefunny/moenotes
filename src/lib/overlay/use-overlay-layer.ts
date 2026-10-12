import { useEffect, useRef } from "react";
import { isTopOverlayLayer, pushOverlayLayer, removeOverlayLayer } from "@/lib/overlay/layer-stack";

/**
 * While `open`, the overlay joins the layer stack (src/lib/overlay/layer-stack.ts) and, with `history`, takes a
 * history entry so the browser's Back button closes it (and closing it steps back off the entry). Returns whether
 * the overlay is the top layer, for key handlers that must only act on the top one.
 */
export function useOverlayLayer(key: string, open: boolean, onClose: () => void, history = true): () => boolean {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    pushOverlayLayer(key);
    let didPushHistory = false;
    const handlePopState = () => {
      if (isTopOverlayLayer(key)) onCloseRef.current();
    };
    if (history && !window.history.state?.modal) {
      window.history.pushState({ modal: true }, "");
      didPushHistory = true;
    }
    // Listen from the next frame: the push above must not count as navigation.
    const raf = requestAnimationFrame(() => window.addEventListener("popstate", handlePopState));
    return () => {
      cancelAnimationFrame(raf);
      removeOverlayLayer(key);
      window.removeEventListener("popstate", handlePopState);
      if (didPushHistory && window.history.state?.modal) window.history.back();
    };
  }, [key, open, history]);

  return () => isTopOverlayLayer(key);
}

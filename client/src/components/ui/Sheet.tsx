import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** The bottom sheet editors reuse; reduced motion is honoured in travel, backdrop fade and drag alike. */
/** What Tab can land on inside the sheet. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children }: Props) {
  const safe = useMotionSafe();
  const panel = useRef<HTMLDivElement>(null);

  // aria-modal: focus moves to the sheet on open and back on close; the opener is read in render.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  useEffect(() => {
    wasOpen.current = open;
    if (!open) return;
    const from = opener.current;
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      if (from?.isConnected) from.focus({ preventScroll: true });
    };
  }, [open]);

  // Escape closes, Tab stays inside, and the page behind must not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const root = panel.current;
      // jsdom has no layout, so the rendered-box check only counts when the panel has one.
      const hasLayout = root.getClientRects().length > 0;
      const stops = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) =>
          !n.closest("[hidden], [inert]") &&
          !n.closest("fieldset:disabled") &&
          (!hasLayout || n.getClientRects().length > 0),
      );
      const first = stops[0];
      const last = stops[stops.length - 1];
      const at = document.activeElement;
      if (!first || !last) {
        // Nothing to move to: stay on the sheet rather than fall behind it.
        e.preventDefault();
      } else if (!panel.current.contains(at) || at === panel.current) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && at === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && at === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: safe ? 0.18 : 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            // Focusable by script only, as the place focus lands on opening.
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[22px] border-t border-edge bg-surface outline-hidden
                       p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]
                       sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-[26rem]
                       sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:border sm:border-edge"
            initial={{ y: safe ? "100%" : 0, opacity: safe ? 1 : 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: safe ? "100%" : 0, opacity: safe ? 1 : 0 }}
            transition={springOrNone(TRANSITIONS.smooth, safe)}
            // Drag to dismiss, downward only; elastic 0.2 so an upward pull resists.
            drag={safe ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={(_, info) => {
              // Velocity as well as distance, so a quick flick dismisses like a native sheet.
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
          >
            <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-edge sm:hidden" />
            <div className="mb-3 text-[17px] font-semibold tracking-tight">{title}</div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

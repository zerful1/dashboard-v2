import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { TRANSITIONS, useMotionSafe, springOrNone } from "@/lib/motion";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * The bottom sheet every later feature's editor reuses.
 *
 * Reduced motion is honoured in three separate places here, because there are
 * three separate ways this could move: the travel collapses, the backdrop fade
 * goes to zero, and drag is switched off entirely. Leaving drag enabled while
 * removing the animation would be the worst of both — the sheet would still
 * follow a finger but arrive without the motion that explains where it went.
 */
/** What Tab can land on inside the sheet. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children }: Props) {
  const safe = useMotionSafe();
  const panel = useRef<HTMLDivElement>(null);

  // The sheet says aria-modal, so it has to behave like one for a keyboard or
  // a screen reader: focus comes in when it opens and goes back where it was
  // when it closes. Before, focus stayed on the button behind the backdrop,
  // and Tab walked the page underneath.
  //
  // Focus lands on the sheet itself, not its first field: focusing an input on
  // a phone raises the keyboard over a sheet nobody has read yet. A child that
  // asks for focus itself (autoFocus) keeps it. Keyed on `open` alone, so a new
  // onClose each render can't re-run this and mistake the sheet for the opener.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  // Escape closes, Tab stays inside, and the page behind must not scroll while
  // a sheet is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panel.current) return;
      const stops = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
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
            // Drag to dismiss. Downward only, and elastic 0.2 so an upward pull
            // resists rather than detaching the sheet from the finger.
            drag={safe ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.2 }}
            onDragEnd={(_, info) => {
              // Velocity as well as distance: a fast flick should dismiss even
              // if it barely moved, which is how a native sheet behaves.
              // Distance alone makes a quick gesture feel ignored.
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

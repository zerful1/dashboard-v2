import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
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
export function Sheet({ open, onClose, title, children }: Props) {
  const safe = useMotionSafe();

  // Escape closes, and the page behind must not scroll while a sheet is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-raised bg-surface
                       p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]
                       sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:w-[26rem]
                       sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
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
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-raised sm:hidden" />
            <div className="lbl mb-3">{title}</div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

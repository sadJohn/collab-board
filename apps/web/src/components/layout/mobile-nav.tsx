import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "@/stores/ui-store";
import { NavLinks } from "./nav-links";

const DRAWER_TRANSITION = { duration: 0.25, ease: "easeOut" as const };
const sheetVariants = {
  open: { x: "0%" },
  closed: { x: "-100%" },
};
const backdropVariants = {
  open: { opacity: 1 },
  closed: { opacity: 0 },
};

/**
 * Mobile navigation drawer.
 *
 * The desktop sidebar is hidden below the `md` breakpoint, so on narrow
 * screens there is otherwise no way to switch sections. We keep a native
 * `<dialog>` opened with `showModal()` so the browser gives us the focus trap,
 * Escape-to-close, inert backdrop, and focus restoration for free. The slide
 * in / out is driven by `motion` variants: opening calls `showModal()` and
 * motion animates the sheet in; closing flips the variant to `closed` and we
 * wait for `onAnimationComplete` before calling `close()`, so the exit plays
 * in every browser (no hand-rolled top-layer exit probing needed).
 *
 * State lives in ui-store (`mobileNavOpen`) and is transient: it is excluded
 * from `partialize`, so it resets to closed on reload.
 */
export function MobileNav() {
  const { t } = useTranslation();
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : DRAWER_TRANSITION;

  // Open imperatively; close is timed by motion's exit animation (see below).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [open]);

  const dismiss = () => setOpen(false);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the onClick only does light-dismiss for clicks outside the sheet; keyboard users get Escape (native), the close button, and the nav links
    <dialog
      ref={dialogRef}
      aria-label={t("nav.menu")}
      id="mobile-nav"
      className="m-0 inset-0 h-dvh w-full max-h-none max-w-none border-0 bg-transparent p-0 backdrop:bg-transparent"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        // Light-dismiss: any click outside the sheet (on the dim backdrop or
        // the dialog itself) closes the drawer.
        if (!sheetRef.current?.contains(event.target as Node)) {
          dismiss();
        }
      }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/50"
        animate={open ? "open" : "closed"}
        initial="closed"
        transition={transition}
        variants={backdropVariants}
      />
      <motion.div
        ref={sheetRef}
        className="relative z-10 flex h-dvh w-64 max-w-[80vw] flex-col border-r border-border bg-background p-4"
        animate={open ? "open" : "closed"}
        initial="closed"
        onAnimationComplete={(definition) => {
          if (definition === "closed" && dialogRef.current?.open) {
            dialogRef.current.close();
          }
        }}
        transition={transition}
        variants={sheetVariants}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-semibold text-sm">{t("nav.menu")}</span>
          <button
            aria-label={t("nav.close")}
            className="rounded-md p-1 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            type="button"
            onClick={dismiss}
          >
            <X className="size-4" />
          </button>
        </div>
        <NavLinks onNavigate={dismiss} />
      </motion.div>
    </dialog>
  );
}

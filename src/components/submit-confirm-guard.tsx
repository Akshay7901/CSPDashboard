import { useEffect, useState, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const bypass = new WeakSet<HTMLElement>();

function isSubmitLike(btn: HTMLElement): boolean {
  if (btn.getAttribute("data-confirm") === "false") return false;
  if (btn.tagName === "BUTTON" && (btn as HTMLButtonElement).type === "submit") return true;
  const label = (btn.getAttribute("aria-label") || btn.textContent || "")
    .trim()
    .toLowerCase();
  return /\bsubmit\b/.test(label);
}

/**
 * On dashboard routes, intercept clicks on submit-like buttons and require
 * the user to confirm via a popup with Submit / Close before the original
 * action runs.
 */
export function SubmitConfirmGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("Submit");
  const pendingRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!pathname.startsWith("/dashboard")) return;
    // These dashboards opt out of the submit confirmation popup.
    if (pathname.startsWith("/dashboard/reviewer")) return;
    if (pathname.startsWith("/dashboard/proposal")) return;
    if (pathname.startsWith("/dashboard/author_proposal")) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest(
        "button, [role='button']",
      ) as HTMLElement | null;
      if (!btn) return;
      if (bypass.has(btn)) {
        bypass.delete(btn);
        return;
      }
      if (btn.tagName === "BUTTON" && (btn as HTMLButtonElement).disabled) return;
      if (!isSubmitLike(btn)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const text =
        (btn.getAttribute("aria-label") || btn.textContent || "Submit")
          .trim()
          .replace(/\s+/g, " ") || "Submit";
      setLabel(text.length > 60 ? `${text.slice(0, 60)}…` : text);
      pendingRef.current = btn;
      setOpen(true);
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [pathname]);

  const confirm = () => {
    const btn = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    if (btn) {
      bypass.add(btn);
      // Re-dispatch the click so the original handler (and the existing
      // ButtonClickToaster) run normally.
      btn.click();
    }
  };

  const cancel = () => {
    pendingRef.current = null;
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : cancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm: {label}</DialogTitle>
          <DialogDescription>
            Are you sure you want to {label.toLowerCase()}? This action will be sent
            to the server.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={cancel} data-confirm="false">
            Close
          </Button>
          <Button onClick={confirm} data-confirm="false">
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";

/**
 * Global delegated click listener. While the user is on a dashboard route,
 * any <button> click shows a small toast at the bottom-right indicating
 * which action was triggered.
 */
export function ButtonClickToaster() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!pathname.startsWith("/dashboard")) return;

    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest(
        "button, [role='button'], a[data-toast='true']",
      ) as HTMLElement | null;
      if (!btn) return;
      if (btn.getAttribute("data-toast") === "false") return;

      // Ignore disabled buttons
      if (
        btn.tagName === "BUTTON" &&
        (btn as HTMLButtonElement).disabled
      )
        return;

      const label =
        btn.getAttribute("aria-label") ||
        btn.getAttribute("title") ||
        (btn.textContent || "").trim().replace(/\s+/g, " ") ||
        "Action";

      const short = label.length > 60 ? `${label.slice(0, 60)}…` : label;
      toast.success(short, {
        duration: 2000,
      });
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [pathname]);

  return null;
}
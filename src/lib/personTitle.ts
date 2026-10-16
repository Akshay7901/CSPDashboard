/**
 * Formats an honorific from the proposal form for display: "Dr" → "Dr.",
 * "Prof" → "Prof.". Titles already ending in a dot are left as is; empty
 * values return "" so callers can hide the field.
 */
export function formatPersonTitle(title?: unknown): string {
  if (typeof title !== "string") return "";
  const t = title.trim();
  if (!t) return "";
  return t.endsWith(".") ? t : `${t}.`;
}

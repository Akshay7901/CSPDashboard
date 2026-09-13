import { useState } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { getCoSignerUrl, type CoSignerUrl } from "@/lib/contractsApi";

export function CoSignerLinks({
  ticket,
  coSigners,
  disabled = false,
  heading = "Share these links with your co-authors — they need to sign the contract too.",
  disabledNote,
}: {
  ticket: string;
  coSigners: CoSignerUrl[];
  disabled?: boolean;
  heading?: string;
  disabledNote?: string;
}) {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  if (!coSigners || coSigners.length === 0) return null;

  const handleGetLink = async (email: string) => {
    setLoadingEmail(email);
    setErrors((prev) => ({ ...prev, [email]: "" }));
    try {
      const res = await getCoSignerUrl(ticket, email);
      setLinks((prev) => ({ ...prev, [email]: res.signing_url }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [email]: (e as Error).message || "Failed to generate link.",
      }));
    } finally {
      setLoadingEmail(null);
    }
  };

  const handleCopy = async (email: string) => {
    const url = links[email];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail((cur) => (cur === email ? null : cur)), 2000);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <div
      className={`mt-4 rounded-xl border p-4 ${
        disabled ? "border-stone-200 bg-stone-50 opacity-60" : "border-violet-200 bg-violet-50/40"
      }`}
    >
      <p className="font-sans text-sm font-bold text-stone-900">Co-signer Links</p>
      <p className="mt-1 font-sans text-xs text-stone-600">{heading}</p>
      {disabled && disabledNote && (
        <p className="mt-1 font-sans text-xs italic text-amber-700">{disabledNote}</p>
      )}
      <div className="mt-3 space-y-3">
        {coSigners.map((signer) => (
          <div key={signer.email} className="rounded-lg border border-stone-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-sans text-sm font-semibold text-stone-900">
                  {signer.name || signer.email}
                </p>
                <p className="truncate font-sans text-xs text-stone-500">{signer.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleGetLink(signer.email)}
                disabled={disabled || loadingEmail === signer.email}
                title={disabled ? disabledNote : undefined}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 font-sans text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Link2 className="h-3.5 w-3.5" />
                {loadingEmail === signer.email ? "Generating…" : "Get Signing Link"}
              </button>
            </div>
            {errors[signer.email] && (
              <p className="mt-2 font-sans text-xs text-rose-600">{errors[signer.email]}</p>
            )}
            {links[signer.email] && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={links[signer.email]}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 truncate rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1.5 font-mono text-xs text-stone-700"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy(signer.email)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 font-sans text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  {copiedEmail === signer.email ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedEmail === signer.email ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 font-sans text-[11px] text-stone-500">
        This link expires in approximately 5 minutes. Generate a new one if it expires before the
        signer uses it.
      </p>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, X as XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { setUserPassword } from "@/lib/usersApi";

const MIN_LENGTH = 8;

// 12 chars with at least one lower, upper, digit and symbol. Look-alike
// characters (0/O, 1/l/I) are left out so the password survives being read
// out or retyped by the author.
function generatePassword(length = 12): string {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const rand = (n: number) => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % n;
  };
  const chars = sets.map((s) => s[rand(s.length)]);
  while (chars.length < length) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Admin-only "Set temporary password" button + modal, for authors whose
 * institutional mail filters swallow OTP emails. Render only for admins.
 */
export function SetTempPasswordButton({
  email,
  onSuccess,
}: {
  email: string;
  onSuccess: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setPassword("");
    setShow(false);
    setError(null);
    setCopied(false);
  };

  const onGenerate = () => {
    setPassword(generatePassword());
    setShow(true);
    setError(null);
    setCopied(false);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the password is visible to copy by hand.
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await setUserPassword(email, password);
      setOpen(false);
      reset();
      onSuccess(res.user?.email || email);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 font-sans text-xs font-semibold text-stone-600 hover:bg-stone-50 hover:text-stone-900"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Set temporary password
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && !saving) setOpen(false);
        }}
      >
        <DialogContent className="max-w-md bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Set temporary password</DialogTitle>
            <DialogDescription>
              For authors who can&apos;t receive login codes by email. They can sign in with this
              password and change it afterwards.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-2 space-y-4">
            <div>
              <label className="font-sans text-xs font-medium uppercase tracking-wide text-stone-500">
                Email
              </label>
              <input
                type="email"
                value={email}
                readOnly
                className="mt-1.5 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-sans text-sm text-stone-700"
              />
            </div>
            <div>
              <label
                htmlFor="temp-password"
                className="font-sans text-xs font-medium uppercase tracking-wide text-stone-500"
              >
                Password
              </label>
              <div className="mt-1.5 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    id="temp-password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setCopied(false);
                    }}
                    minLength={MIN_LENGTH}
                    required
                    autoComplete="new-password"
                    placeholder={`At least ${MIN_LENGTH} characters`}
                    className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-3 pr-16 font-mono text-sm text-stone-900 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-100"
                  />
                  <div className="absolute inset-y-0 right-1 flex items-center">
                    {password && (
                      <button
                        type="button"
                        onClick={() => void onCopy()}
                        title={copied ? "Copied" : "Copy password"}
                        aria-label="Copy password"
                        className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      title={show ? "Hide password" : "Show password"}
                      aria-label={show ? "Hide password" : "Show password"}
                      className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Generate
                </button>
              </div>
            </div>
            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 font-sans text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-[#5B2EBA] px-4 py-2 font-sans text-sm font-semibold text-white hover:bg-[#4a2599] disabled:opacity-60"
              >
                {saving ? "Setting…" : "Set password"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-4 py-2 font-sans text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Dismissible confirmation shown after a temporary password is set. */
export function TempPasswordBanner({ email, onDismiss }: { email: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
      <p className="min-w-0 flex-1 font-sans text-sm text-emerald-900">
        Password set for <span className="font-semibold">{email}</span>. Share it with the author so
        they can log in and change it.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-0.5 text-emerald-700 hover:bg-emerald-100"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

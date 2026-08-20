import { useState, type FormEvent } from "react";
import { Mail, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { proposalApiFetch } from "@/lib/proposalApi";
import { getPortalToken, portalLogout } from "@/lib/auth";

type Props = {
  triggerClassName?: string;
  triggerLabel?: string;
};

export function ChangeEmailButton({ triggerClassName, triggerLabel = "Change email" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 font-sans text-sm text-[#7A6A5A] hover:text-[#2C1A0E]"
        }
      >
        <Mail className="h-4 w-4" />
        {triggerLabel}
      </button>
      {open && <ChangeEmailDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ChangeEmailDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestChange = async (isResend = false) => {
    setError(null);
    setInfo(null);
    const email = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      setError("Please enter a valid email address.");
      return;
    }
    const token = getPortalToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      return;
    }
    setLoading(true);
    try {
      const res = await proposalApiFetch("/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_email: email }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (res.status === 409) {
          setError((data.error as string) || "That email address is already in use.");
        } else {
          setError((data.error as string) || "Unable to send the verification code.");
        }
        return;
      }
      setStep("verify");
      setExpired(false);
      setOtp("");
      setInfo(
        (data.message as string) ||
          (isResend
            ? `A new code has been sent to ${email}.`
            : `We sent a 6-digit verification code to ${email}.`),
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitRequest = (e: FormEvent) => {
    e.preventDefault();
    void requestChange(false);
  };

  const onSubmitVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const code = otp.trim();
    if (!/^\d{4,8}$/.test(code)) {
      setError("Enter the verification code sent to your new email.");
      return;
    }
    const token = getPortalToken();
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      return;
    }
    setLoading(true);
    try {
      const res = await proposalApiFetch("/auth/change-email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ otp: code }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const message = ((data.error as string) || "").toLowerCase();
        if (res.status === 400 && (message.includes("expire") || message.includes("resend"))) {
          setExpired(true);
          setError((data.error as string) || "That code has expired. Request a new one.");
        } else if (res.status === 409) {
          setError((data.error as string) || "That email address is already in use.");
        } else {
          setError((data.error as string) || "Invalid verification code. Please try again.");
        }
        return;
      }
      setInfo(
        (data.message as string) ||
          "Email updated. Please log in again with your new email.",
      );
      await portalLogout();
      navigate({ to: "/login" });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-stone-900">Change email</h2>
            <p className="mt-1 text-sm text-stone-600">
              {step === "request"
                ? "Enter your new email address. We'll send a verification code to confirm it."
                : "Enter the verification code we sent to your new email address."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "request" ? (
          <form onSubmit={onSubmitRequest} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">New email address</label>
              <input
                type="email"
                required
                autoFocus
                maxLength={255}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-[#00422F] px-4 py-2 text-sm font-medium text-white hover:bg-[#00362a] disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onSubmitVerify} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm tracking-[0.3em] focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500"
              />
              <p className="mt-1 text-xs text-stone-500">Sent to {newEmail}</p>
            </div>

            {info && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>
            )}
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void requestChange(true)}
                className={`text-sm font-medium underline-offset-2 hover:underline disabled:opacity-50 ${
                  expired ? "text-red-700" : "text-stone-600"
                }`}
              >
                Resend code
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("request");
                    setError(null);
                    setInfo(null);
                    setExpired(false);
                  }}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-[#00422F] px-4 py-2 text-sm font-medium text-white hover:bg-[#00362a] disabled:opacity-50"
                >
                  {loading ? "Verifying…" : "Verify"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

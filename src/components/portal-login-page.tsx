import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { UserRound, FileText, ClipboardCheck, ArrowRight, ArrowLeft, type LucideIcon } from "lucide-react";
import libraryBg from "@/assets/library-reference.jpg";
import cspLogo from "@/assets/csp-logo.png";
import { getPortalSession, persistPortalSession } from "@/lib/auth";
import { proposalApiFetch } from "@/lib/proposalApi";

type ApiRole = "admin" | "editor" | "reviewer" | "decision_reviewer" | "author" | string;

function roleToPortal(apiRole: ApiRole): Role {
  const r = (apiRole || "").toLowerCase();
  if (r === "decision_reviewer") return "decision_reviewer";
  if (r === "editor" || r === "admin") return "editor";
  if (r === "reviewer" || r === "peer_reviewer" || r.includes("reviewer")) return "reviewer";
  return "author";
}

type Role = "author" | "editor" | "reviewer" | "decision_reviewer";

interface PortalConfig {
  id: Role;
  title: string;
  cardDescription: string;
  formSubtitle: string;
  Icon: LucideIcon;
  toneClass: string;
  badgeClass: string;
  demoEmail: string;
  demoCode: string;
}

const portals: PortalConfig[] = [
  {
    id: "author",
    title: "Author Portal",
    cardDescription: "Track your submission through every stage of the publishing journey.",
    formSubtitle: "Submit and track your book proposals",
    Icon: UserRound,
    toneClass: "bg-portal-author",
    badgeClass: "bg-portal-author text-white",
    demoEmail: "author@university.edu",
    demoCode: "1234",
  },
  {
    id: "editor",
    title: "Editor Portal",
    cardDescription: "Manage the full proposal pipeline from intake to decision.",
    formSubtitle: "Review and manage incoming proposals",
    Icon: FileText,
    toneClass: "bg-portal-editor",
    badgeClass: "bg-portal-editor text-white",
    demoEmail: "editor@csp.com",
    demoCode: "5678",
  },
  {
    id: "reviewer",
    title: "Reviewer Portal",
    cardDescription: "Review assigned proposals and submit your recommendations.",
    formSubtitle: "Complete your assigned peer reviews",
    Icon: ClipboardCheck,
    toneClass: "bg-portal-reviewer",
    badgeClass: "bg-portal-reviewer text-white",
    demoEmail: "reviewer@cambridge.ac.uk",
    demoCode: "9012",
  },
];

export function LoginPage() {
  const [selected, setSelected] = useState<Role | null>(null);
  const portal = portals.find((p) => p.id === selected) ?? null;
  const navigate = useNavigate();

  useEffect(() => {
    const session = getPortalSession();
    if (!session?.role) return;
    if (session.role === "decision_reviewer") {
      navigate({ to: "/dashboard/decision_reviewer" });
      return;
    }
    navigate({ to: "/dashboard/$role", params: { role: session.role } });
  }, [navigate]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden font-sans text-foreground">
      <img
        src={libraryBg}
        alt="Library"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-text/70" />

      <div className="relative z-10 w-full max-w-4xl px-6 py-12">
        <header className="mb-10 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-foreground/20 bg-foreground/10 backdrop-blur-sm">
            <img src={cspLogo} alt="CSP" width={36} height={36} className="invert" />
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            Cambridge Scholars Publishing
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Proposal Management Portal
          </p>
        </header>

        {portal ? (
          <PortalLoginForm portal={portal} onBack={() => setSelected(null)} />
        ) : (
          <PortalCards onSelect={setSelected} />
        )}
      </div>
    </main>
  );
}

function PortalCards({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
      {portals.map(({ id, title, cardDescription, Icon, toneClass }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className="group cursor-pointer rounded-2xl border border-foreground/20 bg-foreground/10 p-7 text-left backdrop-blur-sm transition-all duration-200 hover:border-foreground/40 hover:bg-foreground/20"
        >
          <div
            className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${toneClass} text-foreground`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <h2 className="mb-1 font-serif text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm leading-relaxed text-foreground/60">{cardDescription}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm text-foreground/50 transition-colors group-hover:text-foreground/80">
            Sign in
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </button>
      ))}
    </div>
  );
}

function PortalLoginForm({ portal, onBack }: { portal: PortalConfig; onBack: () => void }) {
  type Step = "email" | "password" | "otp" | "set-password";
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [otpPurpose, setOtpPurpose] = useState<string>("first_login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const goToDashboard = (apiRole: ApiRole, token: string, userEmail: string, name?: string) => {
    const role = roleToPortal(apiRole);
    if (!isRoleAllowedForPortal(apiRole)) {
      setError(buildRoleMismatchError(apiRole));
      return;
    }
    persistPortalSession({ token, email: userEmail, name, role });
    if (role === "decision_reviewer") {
      navigate({ to: "/dashboard/decision_reviewer" });
      return;
    }
    navigate({ to: "/dashboard/$role", params: { role } });
  };

  const onSubmitEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    setLoading(true);
    try {
      const res = await proposalApiFetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // If the API hints at the user's role at this stage, validate it now
      // so the user gets immediate feedback before entering password/OTP.
      const hintedRole = (data.role as string | undefined) || undefined;
      if (hintedRole && !isRoleAllowedForPortal(hintedRole)) {
        setError(buildRoleMismatchError(hintedRole));
        return;
      }
      // First-time login — server issued an OTP
      if (res.ok && data.requires_otp) {
        setOtpPurpose((data.purpose as string) || "first_login");
        setStep("otp");
        setInfo("A verification code has been sent to your email.");
        return;
      }
      // 404 — user not registered
      if (res.status === 404) {
        setError((data.error as string) || "User not found.");
        return;
      }
      // 400 "Password is required" — existing user, prompt for password
      if (res.status === 400) {
        const err = ((data.error as string) || "").toLowerCase();
        if (err.includes("password")) {
          setStep("password");
          return;
        }
        setError((data.error as string) || "Invalid request.");
        return;
      }
      if (!res.ok) {
        setError((data.error as string) || "Unable to sign in.");
        return;
      }
      // Fallback (shouldn't happen per spec) — prompt for password
      setStep("password");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isRoleAllowedForPortal = (apiRole: ApiRole | undefined): boolean => {
    const allowed: Record<Role, string[]> = {
      author: ["author"],
      editor: ["editor", "admin", "decision_reviewer"],
      reviewer: ["reviewer", "peer_reviewer"],
      decision_reviewer: ["decision_reviewer"],
    };
    const normalized = (apiRole || "").toLowerCase();
    return allowed[portal.id].includes(normalized);
  };

  const buildRoleMismatchError = (apiRole: ApiRole | undefined): string => {
    const normalized = (apiRole || "").toLowerCase() || "unknown";
    return `This account is registered as "${normalized}". Please sign in via the ${normalized} portal.`;
  };

  const onSubmitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const body: Record<string, string> = { email: email.trim() };
      if (password) body.password = password;
      const res = await proposalApiFetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((data.error as string) || "Invalid credentials.");
        return;
      }
      if (data.requires_otp) {
        setOtpPurpose((data.purpose as string) || "first_login");
        setStep("otp");
        setInfo("A verification code has been sent to your email.");
        return;
      }
      if (data.token) {
        goToDashboard(
          (data.role as ApiRole) || "author",
          data.token as string,
          (data.email as string) || email.trim(),
          data.name as string | undefined,
        );
      } else {
        setError("Unexpected response from server.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await proposalApiFetch("/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((data.error as string) || "Invalid or expired code.");
        return;
      }
      setTempToken((data.temp_token as string) || null);
      setOtpPurpose((data.purpose as string) || otpPurpose);
      setStep("set-password");
      setInfo("Code verified. Please set your password.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!tempToken) {
      setError("Missing verification token. Please restart.");
      return;
    }
    setLoading(true);
    try {
      const res = await proposalApiFetch("/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temp_token: tempToken, password: newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError((data.error as string) || "Unable to set password.");
        return;
      }
      if (data.token) {
        goToDashboard(
          (data.role as ApiRole) || "author",
          data.token as string,
          (data.email as string) || email.trim(),
          data.name as string | undefined,
        );
      } else {
        setError("Unexpected response from server.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await proposalApiFetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setOtpPurpose("password_reset");
      setStep("otp");
      setInfo("If that email is registered, a verification code has been sent.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-2xl border border-foreground/20 bg-foreground/10 p-7 shadow-xl backdrop-blur-md">
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (step === "email") onBack();
              else if (step === "password" || step === "otp") {
                setStep("email");
                setPassword("");
                setOtp("");
                setError(null);
                setInfo(null);
              } else {
                setStep("email");
                setError(null);
                setInfo(null);
              }
            }}
            className="cursor-pointer text-foreground/50 transition-colors hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className={`rounded-full px-3 py-1 font-sans text-xs font-medium ${portal.badgeClass}`}>
            {portal.title}
          </div>
        </div>

        <h2 className="mb-1 font-serif text-xl font-bold text-foreground">
          {step === "email" && "Welcome back"}
          {step === "password" && "Welcome back"}
          {step === "otp" && "Verify your email"}
          {step === "set-password" && "Set your password"}
        </h2>
        <p className="mb-6 font-sans text-sm text-foreground/60">
          {step === "email" && portal.formSubtitle}
          {step === "password" && portal.formSubtitle}
          {step === "otp" && "Enter the 6-digit code we just sent you."}
          {step === "set-password" && "Choose a password of at least 8 characters."}
        </p>

        {step === "email" && (
          <form onSubmit={onSubmitEmail} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block font-sans text-sm font-medium text-foreground/80">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@university.edu"
                className="w-full rounded-xl border border-foreground/20 bg-foreground/10 px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-foreground/30 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`mt-1 w-full rounded-xl ${portal.toneClass} py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
            >
              {loading ? "Checking…" : "Next"}
            </button>
            {error && <p role="alert" className="text-center font-sans text-xs text-red-300">{error}</p>}
            {info && !error && <p className="text-center font-sans text-xs text-foreground/60">{info}</p>}
          </form>
        )}

        {step === "password" && (
          <form onSubmit={onSubmitLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block font-sans text-sm font-medium text-foreground/80">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                readOnly
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@university.edu"
                className="w-full rounded-xl border border-foreground/20 bg-foreground/5 px-3 py-2.5 font-sans text-sm text-foreground/70 placeholder:text-foreground/30 transition-colors focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block font-sans text-sm font-medium text-foreground/80">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-foreground/20 bg-foreground/10 px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-foreground/30 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`mt-1 w-full rounded-xl ${portal.toneClass} py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
            >
              {loading ? "Signing in…" : "Log in"}
            </button>

            {error && <p role="alert" className="text-center font-sans text-xs text-red-300">{error}</p>}
            {info && !error && <p className="text-center font-sans text-xs text-foreground/60">{info}</p>}

            <button
              type="button"
              onClick={onForgotPassword}
              disabled={loading}
              className="w-full text-center font-sans text-sm text-foreground/40 transition-colors hover:text-foreground/70 disabled:opacity-50"
            >
              Forgot password?
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={onSubmitOtp} className="space-y-4">
            <div>
              <label htmlFor="otp" className="mb-1.5 block font-sans text-sm font-medium text-foreground/80">
                Verification code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                className="w-full rounded-xl border border-foreground/20 bg-foreground/10 px-3 py-2.5 font-sans text-sm tracking-widest text-foreground placeholder:text-foreground/30 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`mt-1 w-full rounded-xl ${portal.toneClass} py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
            >
              {loading ? "Verifying…" : "Verify code"}
            </button>
            {error && <p role="alert" className="text-center font-sans text-xs text-red-300">{error}</p>}
            {info && !error && <p className="text-center font-sans text-xs text-foreground/60">{info}</p>}
          </form>
        )}

        {step === "set-password" && (
          <form onSubmit={onSubmitSetPassword} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1.5 block font-sans text-sm font-medium text-foreground/80">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-foreground/20 bg-foreground/10 px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-foreground/30 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block font-sans text-sm font-medium text-foreground/80">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full rounded-xl border border-foreground/20 bg-foreground/10 px-3 py-2.5 font-sans text-sm text-foreground placeholder:text-foreground/30 transition-colors focus:outline-none focus:ring-2 focus:ring-foreground/30"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`mt-1 w-full rounded-xl ${portal.toneClass} py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50`}
            >
              {loading ? "Saving…" : "Set password & continue"}
            </button>
            {error && <p role="alert" className="text-center font-sans text-xs text-red-300">{error}</p>}
            {info && !error && <p className="text-center font-sans text-xs text-foreground/60">{info}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

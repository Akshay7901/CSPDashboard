import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { portalLogout, getPortalSession } from "@/lib/auth";

type Role = "author" | "editor" | "reviewer";

const ROLE_LABEL: Record<Role, string> = {
  author: "Author Portal",
  editor: "Editor Portal",
  reviewer: "Reviewer Portal",
};

export const Route = createFileRoute("/dashboard/$role")({
  head: () => ({ meta: [{ title: "Dashboard — CSP Proposal Portal" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { role } = Route.useParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    try {
      const session = getPortalSession() as { role: Role; email: string } | null;
      if (!session) {
        navigate({ to: "/login" });
        return;
      }
      if (session.role !== role) {
        navigate({ to: "/login" });
        return;
      }
      setEmail(session.email);
    } catch {
      navigate({ to: "/login" });
    }
  }, [role, navigate]);

  const label = ROLE_LABEL[role as Role] ?? "Dashboard";

  const onLogout = async () => {
    await portalLogout();
    navigate({ to: "/login" });
  };

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="font-sans text-xs uppercase tracking-wider text-foreground/50">
              {label}
            </p>
            <h1 className="font-serif text-2xl font-bold">Welcome{email ? `, ${email}` : ""}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="font-sans text-sm text-foreground/60 hover:text-foreground"
            >
              Switch portal
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl bg-foreground/10 px-3 py-2 font-sans text-sm hover:bg-foreground/20"
            >
              Log out
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-foreground/10 bg-foreground/5 p-8">
          <h2 className="font-serif text-lg font-semibold">Dashboard data</h2>
          <p className="mt-2 font-sans text-sm text-foreground/60">
            This dashboard is API-driven. Connect your endpoint and data will render here for the
            <span className="font-medium text-foreground"> {label}</span>.
          </p>
        </section>
      </div>
    </main>
  );
}
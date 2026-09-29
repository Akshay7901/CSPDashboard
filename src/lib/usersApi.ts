import { proposalApiFetch } from "./proposalApi";
import { getPortalToken } from "./auth";

export type SetPasswordResult = {
  status?: string;
  message?: string;
  user?: { email: string; name?: string; role?: string };
};

/**
 * Admin-only: set a temporary password for a portal user who can't receive
 * OTP emails. Throws with a user-facing message on failure.
 */
export async function setUserPassword(email: string, password: string): Promise<SetPasswordResult> {
  const token = getPortalToken();
  const res = await proposalApiFetch("/users/set-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 404) throw new Error("No portal account found for this email.");
  if (!res.ok) {
    throw new Error(
      (body.error as string) || (body.message as string) || `Request failed (${res.status}).`,
    );
  }
  return body as SetPasswordResult;
}

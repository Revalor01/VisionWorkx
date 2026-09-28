// Account + sign-in link for self-serve signup (/api/start).
//
// Supabase's public signup is DISABLED on the modules project (accounts only
// come from /api/start). With signup disabled, Supabase refuses to email a
// sign-in link to an UNCONFIRMED account ("422 signup_disabled": it treats
// that as a signup). So accounts are created already confirmed -- safe,
// because nobody can use one without the emailed link, which only the inbox
// owner receives -- and accounts left unconfirmed by the old flow are
// confirmed on their next attempt.

export interface StartAuthApi {
  /** admin.createUser; `exists` when the email already has an account. */
  createUser(email: string, metadata: Record<string, string>): Promise<{ ok: true } | { exists: true } | { error: string }>;
  /** signInWithOtp with shouldCreateUser: false. */
  sendLink(email: string): Promise<{ ok: true } | { error: string; code?: string }>;
  /** Confirms an existing account's email (no-op if already confirmed). */
  confirmExisting(email: string): Promise<boolean>;
}

export type StartResult = { ok: true } | { error: "create_failed" | "send_failed"; detail?: string };

export async function createAccountAndSendLink(api: StartAuthApi, email: string, metadata: Record<string, string>): Promise<StartResult> {
  const created = await api.createUser(email, metadata);
  if ("error" in created) return { error: "create_failed", detail: created.error };

  let sent = await api.sendLink(email);
  if ("error" in sent && sent.code === "signup_disabled" && "exists" in created) {
    // An older, still-unconfirmed account: confirm it, then try once more.
    if (await api.confirmExisting(email)) sent = await api.sendLink(email);
  }
  if ("error" in sent) return { error: "send_failed", detail: sent.code ?? sent.error };
  return { ok: true };
}

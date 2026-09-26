// The customer's email on a submission. Forms usually store it as `email`,
// but drafted forms can use other ids (e.g. `email_address`), so fall back to
// the first value that looks like an email. Browser-safe.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function submissionEmail(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  if (typeof data.email === "string" && EMAIL_RE.test(data.email.trim())) return data.email.trim();
  for (const v of Object.values(data)) if (typeof v === "string" && EMAIL_RE.test(v.trim())) return v.trim();
  return null;
}

// Validate a user-supplied "where to go next" value (e.g. ?next=) so a
// redirect can only land on this site. Returns the value as a same-origin
// path ("/partner?tab=x#y"), or `fallback` if it could leave the site.
//
// Rejected: anything not starting with a single "/", protocol-relative
// "//host", backslashes anywhere (browsers treat "\" as "/", so "/\host"
// becomes "//host"), control characters, and anything that still resolves
// to a different origin once parsed.
const PROBE_ORIGIN = "https://same-origin.invalid";

export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string" || value === "") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  return url.pathname + url.search + url.hash;
}

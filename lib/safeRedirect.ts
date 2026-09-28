// Validate a user-supplied "where to go next" value (e.g. ?next=) so a
// redirect can only land on this site. Returns the value as a same-origin
// path ("/partner?tab=x#y"), or `fallback` if it could leave the site.
//
// Rejected: anything not starting with a single "/", protocol-relative
// "//host", backslashes anywhere (browsers treat "\" as "/", so "/\host"
// becomes "//host"), control characters, and anything that still resolves
// to a different origin once parsed. The parsed result is checked again:
// dot segments ("/.//host", "/a/..//host", "/%2e//host") only collapse into
// a protocol-relative "//host" during parsing.
const PROBE_ORIGIN = "https://same-origin.invalid";
const MAX_LENGTH = 2048;

export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string" || value === "" || value.length > MAX_LENGTH) return fallback;
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
  const path = url.pathname + url.search + url.hash;
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}

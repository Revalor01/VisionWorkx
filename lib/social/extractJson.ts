// Claude's raw text output is asked for JSON, but a multi-paragraph field
// (a LinkedIn "caption", a recap "script") sometimes comes back with a
// literal newline splitting paragraphs instead of an escaped "\n" —
// technically invalid JSON that crashes JSON.parse ("Expected ',' or '}'
// after property value..."). Retries once with control characters inside
// string literals escaped, without touching anything outside strings, so a
// well-formed-except-for-this response still parses instead of throwing.
function escapeRawControlCharsInStrings(raw: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of raw) {
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
    } else if (ch === "\\") {
      out += ch;
      escaped = true;
    } else if (ch === '"') {
      out += ch;
      inString = false;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
  }
  return out;
}

export function extractJson<T>(text: string, pattern: RegExp, label: string): T {
  const match = text.match(pattern);
  if (!match) throw new Error(`${label} returned no parseable JSON`);
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return JSON.parse(escapeRawControlCharsInStrings(match[0])) as T;
  }
}

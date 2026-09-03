// The single source of truth for the on-disk shape of a generated app.
//
// `apps.generated_code` is stored as one text blob of `[FILENAME: path]`
// blocks (the format the generation system prompt in app/api/generate emits
// and the deploy pipeline in app/api/deploy consumes). Every feature that
// edits an app after the fact — revisions, rollbacks, the change engine —
// needs to move between that blob and a plain path→content map without ever
// changing what the deploy route would have parsed. This module is that
// bridge; `parseFileList` here is byte-for-byte identical to
// `parseGeneratedCode` in app/api/deploy/route.ts and is meant to replace it.

/** A generated app as `{ "path/to/file.tsx": "<file contents>", ... }`. */
export type FileMap = Record<string, string>;

export interface ParsedFile {
  path: string;
  content: string;
}

// Matches `[FILENAME: some/path.tsx]\n<content>[/FILENAME]`, non-greedy so
// the first `[/FILENAME]` closes the block. Kept character-for-character in
// sync with app/api/deploy/route.ts — do not "improve" one without the other.
const FILE_BLOCK_SOURCE =
  String.raw`\[FILENAME:\s*([^\]\r\n]+)\]\r?\n([\s\S]*?)\[\/FILENAME\]`;

function fileBlockRegex(): RegExp {
  return new RegExp(FILE_BLOCK_SOURCE, "g");
}

/**
 * Parse a `generated_code` blob into an ordered list of files, applying the
 * exact same normalisation the deploy route does: the path is trimmed and
 * has leading slashes stripped, the content is trimmed, and a block with an
 * empty path is dropped. Blocks appear in source order; a duplicate path
 * appears once per occurrence (the deploy route works on this list form).
 */
export function parseFileList(raw: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const re = fileBlockRegex();
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const path = match[1].trim().replace(/^\/+/, "");
    const content = match[2].trim();
    if (path) files.push({ path, content });
  }
  return files;
}

/**
 * Parse a `generated_code` blob into a {@link FileMap}. Identical parsing to
 * {@link parseFileList}; when the same path appears twice the last block
 * wins (a duplicate path in generation output is already a bug, and every
 * consumer of the map form wants one entry per path).
 */
export function parseFileMap(raw: string): FileMap {
  const out: FileMap = {};
  for (const { path, content } of parseFileList(raw)) {
    out[path] = content;
  }
  return out;
}

/**
 * Render a {@link FileMap} back into a `generated_code` blob. Entries keep
 * their insertion order; each becomes a `[FILENAME: path]` block and blocks
 * are separated by a blank line — the layout the generation prompt produces
 * and the deploy route expects.
 *
 * Round-trip: for any map whose values are already trimmed and whose keys
 * carry no leading slash / `]` / newline, `parseFileMap(serializeFileMap(m))`
 * deep-equals `m`. `serializeFileMap` is idempotent through a parse either
 * way (a second round only re-trims).
 */
export function serializeFileMap(files: FileMap): string {
  return Object.entries(files)
    .map(([path, content]) => `[FILENAME: ${path}]\n${content}\n[/FILENAME]`)
    .join("\n\n");
}

export interface MergeOptions {
  /** Paths to drop from the result even if present in `base` or `patch`. */
  deletions?: readonly string[];
}

/**
 * Overlay `patch` onto `base` — every path in `patch` is added or replaced,
 * everything else in `base` is kept, and any path in `options.deletions` is
 * removed last. Returns a new object; neither input is mutated. This is how
 * a change-engine edit (which only re-emits the files it touched) is applied
 * to the current app before redeploy.
 */
export function mergeFileMap(
  base: FileMap,
  patch: FileMap,
  options: MergeOptions = {},
): FileMap {
  const out: FileMap = { ...base, ...patch };
  for (const path of options.deletions ?? []) {
    delete out[path];
  }
  return out;
}

/**
 * The set of paths that changed between two maps: added, or present in both
 * with different content. Used to record `app_revisions.changed_files` and
 * to scope a redeploy. `removed` lists paths in `before` but not `after`.
 */
export function diffFileMaps(
  before: FileMap,
  after: FileMap,
): { changed: string[]; removed: string[] } {
  const changed: string[] = [];
  for (const [path, content] of Object.entries(after)) {
    if (before[path] !== content) changed.push(path);
  }
  const removed = Object.keys(before).filter((path) => !(path in after));
  return { changed, removed };
}

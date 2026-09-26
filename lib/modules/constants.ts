// Safe to import from client and server code.
export const MODULES_AUTH_COOKIE = "vwm-auth";

export const SUBMISSION_STATUSES = ["new", "contacted", "won", "lost"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const MODULE_TYPES = ["lead_capture", "booking", "quote_calculator", "intake_form"] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

/** Public origin for embed snippets. */
export const EMBED_ORIGIN = "https://modules.revalorllc.com";

export const SITE_BUILDERS = [
  "WordPress",
  "Squarespace",
  "Wix",
  "Webflow",
  "Framer",
  "Shopify",
] as const;

/** Private storage bucket for files visitors attach (modules DB). */
export const UPLOAD_BUCKET = "vw-uploads";

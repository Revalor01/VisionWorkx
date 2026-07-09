// Template metadata only — no `sharp` import here, so this file is safe to
// import from client components. templateRenderer.ts (which does import
// sharp, a native Node module) imports TemplateId from here, not vice versa.

export type TemplateId = "bold-header" | "split-panel" | "minimal-white" | "offer-box";

export const TEMPLATES: { id: TemplateId; label: string; bestFor: string }[] = [
  { id: "bold-header", label: "Bold Header", bestFor: "All types — full photo + bold overlay" },
  { id: "split-panel", label: "Split Panel", bestFor: "Services — brand color + photo side by side" },
  { id: "minimal-white", label: "Minimal White", bestFor: "Professional services" },
  { id: "offer-box", label: "Offer Box", bestFor: "Promotions and price offers" },
];

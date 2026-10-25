// Which GitHub repo holds the app under test for each product slug. The "Fix
// this" button dispatches a fix-PR workflow against this repo. Pure data (no
// secrets) so it's safe to import anywhere, including the server page that
// decides whether to show the button.

export const FIX_REPOS: Record<string, string> = {
  visionworkx: "Revalor01/VisionWorkx",
  sanctum: "Revalor01/sanctum-web",
  proactive: "Revalor01/proactive",
  elevate: "Revalor01/elevate-web",
  chorebit: "Revalor01/chorebit",
  feelflow: "Revalor01/feelflow",
  mindbit: "Revalor01/mindbit",
  cfh: "Revalor01/christian-friends-hub",
  "revalor-products": "Revalor01/revalor-products",
};

/** The "Owner/repo" for a product, or null if we don't have one mapped. */
export function repoFor(product: string): string | null {
  return FIX_REPOS[product] ?? null;
}

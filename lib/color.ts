export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Converts a validated hex color to the space-separated RGB triplet format
// Tailwind's <alpha-value> placeholder requires (e.g. "26 58 92"), used for
// site_settings.*_color_rgb — the raw value a generated app's CSS variable
// gets set to at runtime.
export function hexToRgbTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

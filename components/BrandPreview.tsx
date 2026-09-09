"use client";

// Live "what your site will look like" swatch — a card painted with the
// chosen background color holding a sample heading, body copy and a button
// in the primary color. Text colors are auto-picked for contrast and a
// warning shows when the pairing is hard to read. Used in the onboarding
// branding step, the quick /try form, and per-app Settings → Brand Colors.

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 21;
  const la = relLuminance(ra);
  const lb = relLuminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white body text, whichever reads better on `bg`. */
export function readableTextOn(bg: string): "#0B1220" | "#FFFFFF" {
  return contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#0B1220") ? "#FFFFFF" : "#0B1220";
}

export default function BrandPreview({
  primary,
  background,
  font,
  businessName,
}: {
  primary: string;
  background: string;
  font?: string;
  businessName?: string;
}) {
  const textColor = readableTextOn(background);
  const mutedColor = textColor === "#FFFFFF" ? "rgba(255,255,255,0.72)" : "rgba(11,18,32,0.66)";
  const buttonText = readableTextOn(primary);
  const lowContrast = contrastRatio(background, textColor) < 4.5;
  const buttonLowContrast = contrastRatio(primary, buttonText) < 3;
  const name = businessName?.trim() || "Your business";

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-gray-500">Preview</p>
      <div
        className="rounded-xl border border-black/10 p-5 shadow-sm transition-colors"
        style={{ background, color: textColor, fontFamily: font ? `"${font}", system-ui, sans-serif` : undefined }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: mutedColor }}>
          {name}
        </p>
        <h3 className="mt-1 text-lg font-bold leading-snug">Book your appointment online</h3>
        <p className="mt-1 text-sm" style={{ color: mutedColor }}>
          Pick a time, leave your details, and you&apos;re set. We&apos;ll send a confirmation.
        </p>
        <button
          type="button"
          tabIndex={-1}
          className="mt-3 rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: primary, color: buttonText }}
        >
          Get started
        </button>
      </div>
      {(lowContrast || buttonLowContrast) && (
        <p className="mt-1.5 text-xs text-amber-600">
          ⚠ Low contrast — {lowContrast ? "body text" : "the button label"} may be hard to read. Try a
          {lowContrast ? " lighter or darker background" : " stronger primary color"}.
        </p>
      )}
    </div>
  );
}

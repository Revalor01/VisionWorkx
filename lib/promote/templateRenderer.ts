import sharp, { type OverlayOptions } from "sharp";
import type { PromoteCreativeFormat } from "@/lib/database.types";
import type { TemplateId } from "@/lib/promote/templates";

export type { TemplateId } from "@/lib/promote/templates";

const FORMAT_DIMENSIONS: Record<PromoteCreativeFormat, { width: number; height: number }> = {
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1920": { width: 1080, height: 1920 },
  "1200x628": { width: 1200, height: 628 },
};

interface RenderParams {
  templateId: TemplateId;
  businessName: string;
  headline: string;
  bodyText: string;
  cta: string;
  logoBuffer: Buffer | null;
  photoBuffer: Buffer | null;
  brandColor: string;
  format: PromoteCreativeFormat;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// SVG text has no built-in layout — wrap manually by rough char-width estimate.
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function darken(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, (parseInt(h.slice(0, 2), 16) || 0) - amount);
  const g = Math.max(0, (parseInt(h.slice(2, 4), 16) || 0) - amount);
  const b = Math.max(0, (parseInt(h.slice(4, 6), 16) || 0) - amount);
  return `rgb(${r},${g},${b})`;
}

const FONT_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

function ctaPillSvg(x: number, y: number, cta: string, fill: string, textColor: string): string {
  const width = Math.max(140, cta.length * 15 + 60);
  return `
    <rect x="${x}" y="${y}" width="${width}" height="64" rx="32" fill="${fill}" />
    <text x="${x + width / 2}" y="${y + 41}" font-family="${FONT_STACK}" font-size="26" font-weight="700" fill="${textColor}" text-anchor="middle">${escapeXml(cta)}</text>
  `;
}

async function backgroundLayer(
  width: number,
  height: number,
  photoBuffer: Buffer | null,
  fallbackColor: string
): Promise<Buffer> {
  if (photoBuffer) {
    try {
      return await sharp(photoBuffer).resize(width, height, { fit: "cover" }).toBuffer();
    } catch {
      // fall through to solid color
    }
  }
  return sharp({
    create: { width, height, channels: 4, background: fallbackColor },
  })
    .png()
    .toBuffer();
}

async function renderBoldHeader(p: RenderParams, width: number, height: number): Promise<Buffer> {
  const bg = await backgroundLayer(width, height, p.photoBuffer, darken(p.brandColor, 40));
  const headlineLines = wrapText(p.headline, width > 1000 ? 22 : 16);
  const bodyLines = wrapText(p.bodyText, width > 1000 ? 40 : 28);

  const overlayHeight = Math.round(height * 0.45);
  const baseY = height - overlayHeight + 70;
  const headlineSvg = headlineLines
    .map((line, i) => `<text x="60" y="${baseY + i * 66}" font-family="${FONT_STACK}" font-size="58" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`)
    .join("");
  const bodyStartY = baseY + headlineLines.length * 66 + 20;
  const bodySvg = bodyLines
    .map((line, i) => `<text x="60" y="${bodyStartY + i * 34}" font-family="${FONT_STACK}" font-size="28" fill="#e8eaf0">${escapeXml(line)}</text>`)
    .join("");
  const ctaY = bodyStartY + bodyLines.length * 34 + 30;

  const svg = `
    <svg width="${width}" height="${height}">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${hexToRgba("#000000", 0)}" />
          <stop offset="100%" stop-color="${hexToRgba("#000000", 0.85)}" />
        </linearGradient>
      </defs>
      <rect x="0" y="${height - overlayHeight}" width="${width}" height="${overlayHeight}" fill="url(#fade)" />
      ${headlineSvg}
      ${bodySvg}
      ${ctaPillSvg(60, ctaY, p.cta, "#ffffff", darken(p.brandColor, 0))}
    </svg>
  `;

  const composites: OverlayOptions[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];
  if (p.logoBuffer) {
    const logo = await sharp(p.logoBuffer).resize(90, 90, { fit: "contain" }).png().toBuffer();
    composites.push({ input: logo, top: 40, left: width - 130 });
  }
  return sharp(bg).composite(composites).png().toBuffer();
}

async function renderSplitPanel(p: RenderParams, width: number, height: number): Promise<Buffer> {
  const panelWidth = Math.round(width * 0.5);
  const photoWidth = width - panelWidth;
  const photoLayer = p.photoBuffer
    ? await sharp(p.photoBuffer).resize(photoWidth, height, { fit: "cover" }).toBuffer()
    : await sharp({ create: { width: photoWidth, height, channels: 4, background: darken(p.brandColor, 20) } }).png().toBuffer();

  const headlineLines = wrapText(p.headline, 16);
  const bodyLines = wrapText(p.bodyText, 24);
  const headlineY = 120;
  const headlineSvg = headlineLines
    .map((line, i) => `<text x="50" y="${headlineY + i * 60}" font-family="${FONT_STACK}" font-size="50" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`)
    .join("");
  const bodyStartY = headlineY + headlineLines.length * 60 + 30;
  const bodySvg = bodyLines
    .map((line, i) => `<text x="50" y="${bodyStartY + i * 32}" font-family="${FONT_STACK}" font-size="26" fill="#e8eaf0">${escapeXml(line)}</text>`)
    .join("");
  const ctaY = bodyStartY + bodyLines.length * 32 + 40;

  const svg = `
    <svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${panelWidth}" height="${height}" fill="${p.brandColor}" />
      <text x="50" y="60" font-family="${FONT_STACK}" font-size="24" font-weight="700" fill="${hexToRgba("#ffffff", 0.85)}">${escapeXml(p.businessName)}</text>
      ${headlineSvg}
      ${bodySvg}
      ${ctaPillSvg(50, ctaY, p.cta, "#ffffff", darken(p.brandColor, 0))}
    </svg>
  `;

  return sharp({ create: { width, height, channels: 4, background: p.brandColor } })
    .composite([
      { input: photoLayer, top: 0, left: panelWidth },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function renderMinimalWhite(p: RenderParams, width: number, height: number): Promise<Buffer> {
  const headlineLines = wrapText(p.headline, width > 1000 ? 26 : 18);
  const bodyLines = wrapText(p.bodyText, width > 1000 ? 44 : 30);
  const centerX = width / 2;
  const headlineStartY = Math.round(height * 0.32);
  const headlineSvg = headlineLines
    .map((line, i) => `<text x="${centerX}" y="${headlineStartY + i * 60}" font-family="${FONT_STACK}" font-size="52" font-weight="800" fill="#13161f" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("");
  const bodyStartY = headlineStartY + headlineLines.length * 60 + 30;
  const bodySvg = bodyLines
    .map((line, i) => `<text x="${centerX}" y="${bodyStartY + i * 32}" font-family="${FONT_STACK}" font-size="27" fill="#5b6270" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("");
  const ctaY = bodyStartY + bodyLines.length * 32 + 40;
  const ctaWidth = Math.max(160, p.cta.length * 15 + 60);

  const svg = `
    <svg width="${width}" height="${height}">
      <circle cx="${centerX}" cy="130" r="70" fill="${hexToRgba(p.brandColor, 0.12)}" stroke="${p.brandColor}" stroke-width="3" />
      <text x="${centerX}" y="145" font-family="${FONT_STACK}" font-size="34" font-weight="800" fill="${p.brandColor}" text-anchor="middle">${escapeXml(p.businessName.slice(0, 2).toUpperCase())}</text>
      ${headlineSvg}
      ${bodySvg}
      ${ctaPillSvg(centerX - ctaWidth / 2, ctaY, p.cta, p.brandColor, "#ffffff")}
    </svg>
  `;

  const base = sharp({ create: { width, height, channels: 4, background: "#ffffff" } });
  const composites: OverlayOptions[] = [{ input: Buffer.from(svg), top: 0, left: 0 }];

  if (p.logoBuffer) {
    const logo = await sharp(p.logoBuffer).resize(120, 120, { fit: "contain" }).png().toBuffer();
    composites.unshift({ input: logo, top: 70, left: Math.round(centerX - 60) });
  }

  return base.composite(composites).png().toBuffer();
}

async function renderOfferBox(p: RenderParams, width: number, height: number): Promise<Buffer> {
  const centerX = width / 2;
  const headlineLines = wrapText(p.headline, width > 1000 ? 20 : 14);
  const bodyLines = wrapText(p.bodyText, width > 1000 ? 40 : 26);
  const headlineStartY = Math.round(height * 0.4);
  const headlineSvg = headlineLines
    .map((line, i) => `<text x="${centerX}" y="${headlineStartY + i * 74}" font-family="${FONT_STACK}" font-size="64" font-weight="900" fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("");
  const bodyStartY = headlineStartY + headlineLines.length * 74 + 30;
  const bodySvg = bodyLines
    .map((line, i) => `<text x="${centerX}" y="${bodyStartY + i * 32}" font-family="${FONT_STACK}" font-size="28" fill="${hexToRgba("#ffffff", 0.85)}" text-anchor="middle">${escapeXml(line)}</text>`)
    .join("");
  const ctaY = bodyStartY + bodyLines.length * 32 + 40;
  const ctaWidth = Math.max(170, p.cta.length * 16 + 60);

  const svg = `
    <svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="${p.brandColor}" />
      <rect x="0" y="0" width="${width}" height="${height}" fill="url(#vign)" />
      <defs>
        <radialGradient id="vign" cx="50%" cy="35%" r="75%">
          <stop offset="0%" stop-color="${hexToRgba("#000000", 0)}" />
          <stop offset="100%" stop-color="${hexToRgba("#000000", 0.25)}" />
        </radialGradient>
      </defs>
      <text x="${centerX}" y="70" font-family="${FONT_STACK}" font-size="26" font-weight="700" fill="${hexToRgba("#ffffff", 0.8)}" text-anchor="middle">${escapeXml(p.businessName.toUpperCase())}</text>
      ${headlineSvg}
      ${bodySvg}
      ${ctaPillSvg(centerX - ctaWidth / 2, ctaY, p.cta, "#ffffff", darken(p.brandColor, 0))}
    </svg>
  `;

  return sharp({ create: { width, height, channels: 4, background: p.brandColor } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

const TEMPLATE_RENDERERS: Record<
  TemplateId,
  (p: RenderParams, width: number, height: number) => Promise<Buffer>
> = {
  "bold-header": renderBoldHeader,
  "split-panel": renderSplitPanel,
  "minimal-white": renderMinimalWhite,
  "offer-box": renderOfferBox,
};

export async function fetchImageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function renderAdTemplate(params: RenderParams): Promise<Buffer> {
  const { width, height } = FORMAT_DIMENSIONS[params.format];
  const renderer = TEMPLATE_RENDERERS[params.templateId];
  if (!renderer) throw new Error(`Unknown template: ${params.templateId}`);
  return renderer(params, width, height);
}

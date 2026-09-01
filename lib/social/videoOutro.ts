import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
// @ts-expect-error - no published types for ffprobe-static
import ffprobeStatic from "ffprobe-static";

// Mirrors app/admin/social/BrandsTab.tsx's BRAND_LOGOS - duplicated because
// that's a client component and this runs server-side only. Keep both in
// sync if a brand's logo file ever changes.
const BRAND_LOGOS: Record<string, string> = {
  VisionWorkx: "/VisionWorks.png",
  "Revalor Kids": "/revalor-kids-logo.png",
  "Revalor LLC": "/revalor-logo.png",
  "Revalor Wellness": "/revalor-wellness-logo.png",
};

const REVALOR_LLC_BRAND_NAME = "Revalor LLC";
const OUTRO_SECONDS = 2;

function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app").replace(/\/$/, "");
}

async function fetchLogoBytes(brandName: string): Promise<Buffer | null> {
  const logoPath = BRAND_LOGOS[brandName];
  if (!logoPath) return null;
  try {
    const res = await fetch(`${siteBaseUrl()}${logoPath}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = "";
    let stdout = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function probeVideo(filePath: string): Promise<{ width: number; height: number; fps: string; hasAudio: boolean }> {
  const out = await run(ffprobeStatic.path, [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    filePath,
  ]);
  const streams: Array<{ codec_type: string; width?: number; height?: number; r_frame_rate?: string }> = JSON.parse(out).streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  if (!video?.width || !video?.height) throw new Error("Could not determine source video resolution");
  return { width: video.width, height: video.height, fps: video.r_frame_rate || "30/1", hasAudio };
}

// Appends a short end-card to a generated video: the given brand's logo
// plus Revalor's own logo (skipped if the brand already IS Revalor LLC) on
// a solid background, sized to match the source clip so concatenation
// doesn't glitch. Exists so every AI-generated post makes clear it's
// promoting a Revalor *software* product, not just abstract b-roll.
// Best-effort: any failure (missing binary, missing logo, ffmpeg error)
// returns the original bytes unchanged rather than blocking publishing
// over a cosmetic step.
export async function appendBrandOutro(videoBytes: Buffer, brandName: string): Promise<Buffer> {
  if (!ffmpegPath) return videoBytes;

  const brandLogoBytes = await fetchLogoBytes(brandName);
  if (!brandLogoBytes) return videoBytes;
  const includeRevalorLogo = brandName !== REVALOR_LLC_BRAND_NAME;
  const revalorLogoBytes = includeRevalorLogo ? await fetchLogoBytes(REVALOR_LLC_BRAND_NAME) : null;

  const dir = await mkdtemp(path.join(tmpdir(), "revalor-outro-"));
  try {
    const inputPath = path.join(dir, "input.mp4");
    const brandLogoPath = path.join(dir, "brand-logo.png");
    const revalorLogoPath = path.join(dir, "revalor-logo.png");
    const outroPath = path.join(dir, "outro.mp4");
    const outputPath = path.join(dir, "output.mp4");

    await writeFile(inputPath, videoBytes);
    await writeFile(brandLogoPath, brandLogoBytes);
    if (revalorLogoBytes) await writeFile(revalorLogoPath, revalorLogoBytes);

    const { width, height, fps, hasAudio } = await probeVideo(inputPath);

    // Build the outro as: solid brand-navy background + centered logo(s),
    // scaled to fit ~60% of frame width, held for OUTRO_SECONDS. Silent
    // audio track added when the source has audio, so the concat filter
    // (which requires matching stream counts) doesn't fail.
    const logoInputs = ["-loop", "1", "-i", brandLogoPath];
    if (revalorLogoBytes) logoInputs.push("-loop", "1", "-i", revalorLogoPath);
    const audioInput = hasAudio ? ["-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo`] : [];

    // Note: color=...[bg] is a filtergraph-internal generator, not a
    // numbered -i input - the real inputs (logo images, then anullsrc)
    // start at [0:v] regardless of how many filters precede them.
    const maxLogoW = Math.round(width * 0.6);
    const filters: string[] = [`color=c=0x1A3A5C:s=${width}x${height}:d=${OUTRO_SECONDS}[bg]`];
    if (revalorLogoBytes) {
      filters.push(
        `[0:v]scale=${maxLogoW}:-1:force_original_aspect_ratio=decrease[brandlogo]`,
        `[1:v]scale=${Math.round(maxLogoW * 0.7)}:-1:force_original_aspect_ratio=decrease[revalorlogo]`,
        `[bg][brandlogo]overlay=(W-w)/2:(H-h)/2-h*0.6:enable='between(t,0,${OUTRO_SECONDS})'[bg1]`,
        `[bg1][revalorlogo]overlay=(W-w)/2:(H-h)/2+h*0.9:enable='between(t,0,${OUTRO_SECONDS})'[vout]`
      );
    } else {
      filters.push(
        `[0:v]scale=${maxLogoW}:-1:force_original_aspect_ratio=decrease[brandlogo]`,
        `[bg][brandlogo]overlay=(W-w)/2:(H-h)/2:enable='between(t,0,${OUTRO_SECONDS})'[vout]`
      );
    }

    const outroArgs = [
      "-y",
      ...logoInputs,
      ...audioInput,
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      ...(hasAudio ? ["-map", `${revalorLogoBytes ? 2 : 1}:a`] : []),
      "-t", String(OUTRO_SECONDS),
      "-r", fps,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      ...(hasAudio ? ["-c:a", "aac"] : []),
      outroPath,
    ];
    await run(ffmpegPath, outroArgs);

    const concatArgs = hasAudio
      ? [
          "-y",
          "-i", inputPath,
          "-i", outroPath,
          "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
          "-map", "[v]",
          "-map", "[a]",
          "-c:v", "libx264",
          "-c:a", "aac",
          outputPath,
        ]
      : [
          "-y",
          "-i", inputPath,
          "-i", outroPath,
          "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
          "-map", "[v]",
          "-c:v", "libx264",
          outputPath,
        ];
    await run(ffmpegPath, concatArgs);

    return await readFile(outputPath);
  } catch (err) {
    console.error("[videoOutro] appendBrandOutro failed, publishing without outro:", (err as Error).message);
    return videoBytes;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
